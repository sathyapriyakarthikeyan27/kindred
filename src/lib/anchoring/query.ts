import { prisma } from "@/lib/db";
import {
  verifyDonationEntries,
  verifyEntry,
  type EntryVerification,
} from "./service";

/**
 * Public verification queries: a donation number ("D-5" / "5"?—no, bare
 * numbers are seqs), a ledger seq, or a 64-hex entry hash.
 */
export type VerificationResult =
  | { type: "donation"; donationNumber: number; entries: EntryVerification[] }
  | { type: "entry"; entry: EntryVerification }
  | { type: "not_found"; query: string };

export async function verifyQuery(raw: string): Promise<VerificationResult> {
  const q = raw.trim();

  const donationMatch = q.match(/^D-?(\d+)$/i);
  if (donationMatch) {
    const result = await verifyDonationEntries(Number(donationMatch[1]));
    if (result && result.entries.length > 0) {
      return { type: "donation", donationNumber: result.donationNumber, entries: result.entries };
    }
    return { type: "not_found", query: q };
  }

  if (/^[0-9a-f]{64}$/i.test(q)) {
    const entry = await prisma.ledgerEntry.findUnique({
      where: { entryHash: q.toLowerCase() },
      select: { seq: true },
    });
    if (entry) {
      const v = await verifyEntry(entry.seq);
      if (v) return { type: "entry", entry: v };
    }
    return { type: "not_found", query: q };
  }

  if (/^\d+$/.test(q)) {
    const v = await verifyEntry(BigInt(q));
    if (v) return { type: "entry", entry: v };
    return { type: "not_found", query: q };
  }

  return { type: "not_found", query: q };
}
