import { LedgerEntryKind, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeEntryHash, GENESIS_HASH } from "./canonical";

/**
 * The ledger service — the ONLY way money movements are recorded (spec §4.3).
 *
 * Guarantees:
 *  - Append-only: UPDATE/DELETE are rejected by a Postgres trigger; this
 *    service only ever INSERTs. Corrections are new offsetting entries.
 *  - Hash chain: every entry commits to the previous entry's hash, so any
 *    historical alteration breaks every later hash.
 *  - Single-writer ordering: a Postgres advisory lock serializes appends, so
 *    seq order and chain order always agree even under concurrency.
 */

const LEDGER_WRITE_LOCK = 815_001; // arbitrary app-wide advisory lock id

export interface AppendLedgerEntryInput {
  kind: LedgerEntryKind;
  /** Positive integer paise; direction is implied by `kind`. */
  amountPaise: bigint;
  currency?: string;
  donationId?: string;
  allocationId?: string;
  disbursementId?: string;
  caseId?: string;
  /** Canonical snapshot of the event — proof sha256s, gateway refs, actor ids. */
  payload: Prisma.InputJsonValue;
}

export async function appendLedgerEntry(
  input: AppendLedgerEntryInput,
  client: PrismaClient = prisma,
) {
  if (input.amountPaise <= 0n) {
    throw new Error("Ledger amounts must be positive; direction is implied by kind.");
  }

  return client.$transaction(async (tx) => {
    // Serialize all ledger writes for this transaction's lifetime
    // (::text cast — the driver adapter cannot deserialize void)
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${LEDGER_WRITE_LOCK})::text`;

    const last = await tx.ledgerEntry.findFirst({
      orderBy: { seq: "desc" },
      select: { entryHash: true },
    });
    const prevHash = last?.entryHash ?? GENESIS_HASH;

    const createdAt = new Date();
    const fields = {
      kind: input.kind,
      amountPaise: input.amountPaise,
      currency: input.currency ?? "INR",
      donationId: input.donationId ?? null,
      allocationId: input.allocationId ?? null,
      disbursementId: input.disbursementId ?? null,
      caseId: input.caseId ?? null,
      payload: input.payload,
      createdAt,
    };

    return tx.ledgerEntry.create({
      data: { ...fields, prevHash, entryHash: computeEntryHash(prevHash, fields) },
    });
  });
}

export interface ChainVerificationResult {
  ok: boolean;
  entriesChecked: number;
  /** seq of the first entry whose hash or linkage fails, if any */
  firstBadSeq: bigint | null;
  error: string | null;
}

/**
 * Re-derives the entire hash chain from raw table data. Any tampering with a
 * historical row (even via superuser SQL) surfaces here — and, once anchoring
 * is live, on the public /transparency page.
 */
export async function verifyLedgerChain(
  client: PrismaClient = prisma,
): Promise<ChainVerificationResult> {
  const entries = await client.ledgerEntry.findMany({ orderBy: { seq: "asc" } });

  let prevHash = GENESIS_HASH;
  for (const entry of entries) {
    if (entry.prevHash !== prevHash) {
      return {
        ok: false,
        entriesChecked: entries.length,
        firstBadSeq: entry.seq,
        error: `seq ${entry.seq}: prevHash does not match preceding entry`,
      };
    }
    const recomputed = computeEntryHash(prevHash, entry);
    if (recomputed !== entry.entryHash) {
      return {
        ok: false,
        entriesChecked: entries.length,
        firstBadSeq: entry.seq,
        error: `seq ${entry.seq}: stored entryHash does not match recomputed hash`,
      };
    }
    prevHash = entry.entryHash;
  }

  return { ok: true, entriesChecked: entries.length, firstBadSeq: null, error: null };
}
