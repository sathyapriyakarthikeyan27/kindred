/**
 * Step 5 verification (run with: npm run verify:anchoring).
 *
 * Proves the anchoring layer end-to-end:
 *   - a batch covers exactly the unanchored seq range
 *   - every covered entry's hash, chain link, and Merkle proof verify
 *   - re-running with nothing new is a no-op
 *   - new ledger activity lands in the NEXT batch, older anchors untouched
 *   - the public query parser handles D-numbers, seqs, hashes, and garbage
 */
import { prisma } from "../src/lib/db";
import { createAnchorBatch, verifyDonationEntries, verifyEntry } from "../src/lib/anchoring/service";
import { verifyQuery } from "../src/lib/anchoring/query";
import { appendLedgerEntry } from "../src/lib/ledger/ledger";

const ok = (msg: string) => console.log(`  ✅ ${msg}`);
const section = (msg: string) => console.log(`\n${msg}`);

async function main() {
  section("1. Batch the unanchored range");
  // guarantee at least one unanchored entry so the script is re-runnable
  await appendLedgerEntry({
    kind: "ADJUSTMENT",
    amountPaise: 1n,
    payload: { note: "anchoring verification run marker" },
  });
  const before = await prisma.anchor.findFirst({ orderBy: { toSeq: "desc" } });
  const anchor = await createAnchorBatch();
  if (!anchor) throw new Error("expected a batch (there are unanchored entries)");
  const expectedFrom = (before?.toSeq ?? 0n) + 1n;
  if (anchor.fromSeq < expectedFrom) throw new Error("batch overlaps a previous anchor");
  ok(`anchor covers seq ${anchor.fromSeq}–${anchor.toSeq}, root ${anchor.merkleRoot.slice(0, 16)}…`);

  section("2. Every covered entry verifies");
  const covered = await prisma.ledgerEntry.findMany({
    where: { seq: { gte: anchor.fromSeq, lte: anchor.toSeq } },
    orderBy: { seq: "asc" },
    select: { seq: true },
  });
  for (const { seq } of covered) {
    const v = await verifyEntry(seq);
    if (!v) throw new Error(`entry ${seq} missing`);
    if (!v.hashValid) throw new Error(`seq ${seq}: hash invalid`);
    if (!v.chainLinkValid) throw new Error(`seq ${seq}: chain link broken`);
    if (!v.anchor?.proofValid) throw new Error(`seq ${seq}: Merkle proof failed`);
  }
  ok(`${covered.length} entries: record hash ✓, chain link ✓, Merkle proof ✓`);

  section("3. Idempotence + next batch");
  if ((await createAnchorBatch()) !== null) throw new Error("expected no-op, got a new anchor");
  ok("nothing new → no anchor created");

  await appendLedgerEntry({
    kind: "ADJUSTMENT",
    amountPaise: 1n,
    payload: { note: "anchoring verification marker" },
  });
  const next = await createAnchorBatch();
  if (!next) throw new Error("expected a new batch for the new entry");
  if (next.fromSeq !== anchor.toSeq + 1n || next.fromSeq !== next.toSeq) {
    throw new Error(`next batch has wrong range: ${next.fromSeq}–${next.toSeq}`);
  }
  const vNew = await verifyEntry(next.fromSeq);
  if (!vNew?.anchor?.proofValid) throw new Error("single-leaf proof failed");
  ok(`new activity → next batch (seq ${next.fromSeq}), single-leaf proof ✓, old anchors untouched`);

  section("4. Public query parsing");
  const donation = await prisma.donation.findFirstOrThrow({
    where: { ledgerEntries: { some: {} } }, // a donation that reached the ledger
    orderBy: { donationNumber: "asc" },
    select: { donationNumber: true },
  });
  const dn = donation.donationNumber;

  const byDonation = await verifyQuery(`D-${dn}`);
  if (byDonation.type !== "donation") throw new Error("D-number query failed");
  if (!byDonation.entries.every((e) => e.hashValid && e.anchor?.proofValid)) {
    throw new Error("donation entries failed verification");
  }
  ok(`"D-${dn}" → ${byDonation.entries.length} entries, all anchored + proofs ✓`);

  const someHash = byDonation.entries[0].entryHash;
  if ((await verifyQuery(someHash)).type !== "entry") throw new Error("hash query failed");
  if ((await verifyQuery(byDonation.entries[0].seq.toString())).type !== "entry") {
    throw new Error("seq query failed");
  }
  if ((await verifyQuery("what-is-this")).type !== "not_found") {
    throw new Error("garbage should be not_found");
  }
  ok("hash query ✓, seq query ✓, garbage → not found ✓");

  const donationEntries = await verifyDonationEntries(dn);
  if (!donationEntries || donationEntries.entries.length === 0) {
    throw new Error("verifyDonationEntries empty");
  }

  console.log(
    "\n🎉 Step 5 verified. Open http://localhost:3000/transparency and verify D-" +
      `${dn} yourself.\n   (On-chain submission activates when POLYGON_RPC_URL + POLYGON_PRIVATE_KEY are set.)\n`,
  );
}

main()
  .catch((e) => {
    console.error("\n❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
