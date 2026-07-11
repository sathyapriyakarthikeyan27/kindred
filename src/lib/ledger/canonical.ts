import { createHash } from "node:crypto";

/**
 * Canonical serialization for ledger hashing.
 *
 * The same entry must always produce the same bytes, whether hashed at write
 * time (JS objects) or re-verified later (values read back from Postgres).
 * Rules: object keys sorted, BigInt → decimal string, Date → ISO-8601 (ms),
 * undefined treated as null. Floats are forbidden in ledger payloads by
 * convention — money is always integer paise as BigInt or string.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** The fields of a ledger entry that are committed to by its hash. */
export interface HashableEntry {
  kind: string;
  amountPaise: bigint;
  currency: string;
  donationId: string | null;
  allocationId: string | null;
  disbursementId: string | null;
  caseId: string | null;
  payload: unknown;
  createdAt: Date;
}

/** entryHash = sha256( prevHash ‖ canonical(entry fields) ) */
export function computeEntryHash(prevHash: string, entry: HashableEntry): string {
  const canonical = stableStringify({
    kind: entry.kind,
    amountPaise: entry.amountPaise,
    currency: entry.currency,
    donationId: entry.donationId,
    allocationId: entry.allocationId,
    disbursementId: entry.disbursementId,
    caseId: entry.caseId,
    payload: entry.payload,
    createdAt: entry.createdAt,
  });
  return sha256Hex(prevHash + canonical);
}

export const GENESIS_HASH = "GENESIS";
