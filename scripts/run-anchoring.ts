/**
 * The anchoring job (run with: npm run anchor:run — hourly in production).
 *
 * 1. Batches all ledger entries since the last anchor into a Merkle root.
 * 2. Submits the root to Polygon when configured; otherwise the anchor is
 *    recorded PENDING — the root is fixed either way, and can be submitted
 *    later without recomputation.
 */
import { prisma } from "../src/lib/db";
import { createAnchorBatch } from "../src/lib/anchoring/service";
import { chainConfigured, submitAnchor } from "../src/lib/anchoring/chain";

async function main() {
  const anchor = await createAnchorBatch();
  if (!anchor) {
    console.log("Nothing to anchor — all ledger entries are already covered.");
    return;
  }
  console.log(
    `Anchor created: seq ${anchor.fromSeq}–${anchor.toSeq}, root ${anchor.merkleRoot.slice(0, 16)}…`,
  );

  if (!chainConfigured()) {
    console.log(
      "Polygon not configured (POLYGON_RPC_URL / POLYGON_PRIVATE_KEY) — anchor recorded as PENDING.",
    );
    return;
  }
  const confirmed = await submitAnchor(anchor.id);
  console.log(`Anchored on ${confirmed.network}: tx ${confirmed.txHash}`);
}

main()
  .catch((e) => {
    console.error("Anchoring failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
