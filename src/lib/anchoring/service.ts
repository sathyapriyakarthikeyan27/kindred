import { prisma } from "@/lib/db";
import { computeEntryHash } from "@/lib/ledger/canonical";
import {
  buildMerkleRoot,
  getMerkleProof,
  verifyMerkleProof,
  type MerkleProofStep,
} from "@/lib/ledger/merkle";

/**
 * Anchoring (spec §5): batches of new ledger entries are committed to a
 * public chain as one Merkle root. Entries stay strictly immutable — proofs
 * are recomputed on demand from the anchored seq range, never stored.
 *
 * On-chain submission lives in ./chain.ts and is script-only; everything
 * here is pure database + hashing, safe to use from pages.
 */

/**
 * Create the next anchor batch: all ledger entries newer than the last
 * anchored seq. Returns null when there is nothing new to anchor.
 */
export async function createAnchorBatch() {
  const last = await prisma.anchor.findFirst({ orderBy: { toSeq: "desc" } });
  const entries = await prisma.ledgerEntry.findMany({
    where: last ? { seq: { gt: last.toSeq } } : {},
    orderBy: { seq: "asc" },
    select: { seq: true, entryHash: true },
  });
  if (entries.length === 0) return null;

  const root = buildMerkleRoot(entries.map((e) => e.entryHash));
  return prisma.anchor.create({
    data: {
      fromSeq: entries[0].seq,
      toSeq: entries[entries.length - 1].seq,
      merkleRoot: root,
      status: "PENDING",
    },
  });
}

export interface EntryVerification {
  seq: bigint;
  kind: string;
  amountPaise: bigint;
  createdAt: Date;
  entryHash: string;
  /** stored hash matches a fresh recompute of the entry's canonical fields */
  hashValid: boolean;
  /** links to the previous entry's hash (chain intact at this hop) */
  chainLinkValid: boolean;
  anchor: {
    merkleRoot: string;
    network: string;
    txHash: string | null;
    status: string;
    anchoredAt: Date | null;
    /** Merkle proof from this entry up to the anchored root verifies */
    proofValid: boolean;
    proof: MerkleProofStep[];
  } | null;
}

/**
 * Publicly verify one ledger entry: recompute its hash from raw fields,
 * check the chain link, and — if an anchor covers it — rebuild the Merkle
 * proof against the (on-chain) root.
 */
export async function verifyEntry(seq: bigint): Promise<EntryVerification | null> {
  const entry = await prisma.ledgerEntry.findUnique({ where: { seq } });
  if (!entry) return null;

  const recomputed = computeEntryHash(entry.prevHash, entry);
  const hashValid = recomputed === entry.entryHash;

  const prev = await prisma.ledgerEntry.findFirst({
    where: { seq: { lt: seq } },
    orderBy: { seq: "desc" },
    select: { entryHash: true },
  });
  const chainLinkValid = prev ? entry.prevHash === prev.entryHash : entry.prevHash === "GENESIS";

  const anchor = await prisma.anchor.findFirst({
    where: { fromSeq: { lte: seq }, toSeq: { gte: seq } },
  });

  let anchorResult: EntryVerification["anchor"] = null;
  if (anchor) {
    const leaves = await prisma.ledgerEntry.findMany({
      where: { seq: { gte: anchor.fromSeq, lte: anchor.toSeq } },
      orderBy: { seq: "asc" },
      select: { seq: true, entryHash: true },
    });
    const index = leaves.findIndex((l) => l.seq === seq);
    const hashes = leaves.map((l) => l.entryHash);
    const proof = getMerkleProof(hashes, index);
    anchorResult = {
      merkleRoot: anchor.merkleRoot,
      network: anchor.network,
      txHash: anchor.txHash,
      status: anchor.status,
      anchoredAt: anchor.anchoredAt,
      proofValid: verifyMerkleProof(entry.entryHash, proof, anchor.merkleRoot),
      proof,
    };
  }

  return {
    seq: entry.seq,
    kind: entry.kind,
    amountPaise: entry.amountPaise,
    createdAt: entry.createdAt,
    entryHash: entry.entryHash,
    hashValid,
    chainLinkValid,
    anchor: anchorResult,
  };
}

/** Verify every ledger entry belonging to a donation (incl. its payouts). */
export async function verifyDonationEntries(donationNumber: number) {
  const donation = await prisma.donation.findUnique({
    where: { donationNumber },
    select: {
      donationNumber: true,
      allocations: {
        select: { milestone: { select: { disbursements: { select: { id: true } } } } },
      },
    },
  });
  if (!donation) return null;

  const disbursementIds = donation.allocations
    .flatMap((a) => a.milestone?.disbursements ?? [])
    .map((d) => d.id);
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      OR: [
        { donation: { donationNumber } },
        ...(disbursementIds.length ? [{ disbursementId: { in: disbursementIds } }] : []),
      ],
    },
    orderBy: { seq: "asc" },
    select: { seq: true },
  });

  const results: EntryVerification[] = [];
  for (const e of entries) {
    const v = await verifyEntry(e.seq);
    if (v) results.push(v);
  }
  return { donationNumber, entries: results };
}

/** Recent anchors for the public /transparency page. */
export async function listAnchors(limit = 20) {
  return prisma.anchor.findMany({ orderBy: { toSeq: "desc" }, take: limit });
}
