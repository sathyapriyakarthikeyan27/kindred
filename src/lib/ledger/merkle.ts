import { sha256Hex } from "./canonical";

/**
 * Merkle batching for on-chain anchoring (spec §5).
 *
 * An Anchor commits a contiguous seq range of ledger entries: leaves are the
 * entries' entryHash values in seq order. Only the 32-byte root goes to
 * Polygon; proofs are recomputed on demand from the range, so ledger rows
 * stay strictly immutable (no per-entry proof columns to update).
 */

function hashPair(left: string, right: string): string {
  return sha256Hex(left + right);
}

export function buildMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) throw new Error("Cannot build a Merkle tree with no leaves");
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      // Odd node is paired with itself
      next.push(hashPair(level[i], level[i + 1] ?? level[i]));
    }
    level = next;
  }
  return level[0];
}

export interface MerkleProofStep {
  sibling: string;
  position: "left" | "right";
}

export function getMerkleProof(leaves: string[], index: number): MerkleProofStep[] {
  if (index < 0 || index >= leaves.length) throw new Error("Leaf index out of range");
  const proof: MerkleProofStep[] = [];
  let level = [...leaves];
  let i = index;
  while (level.length > 1) {
    const isRight = i % 2 === 1;
    const siblingIndex = isRight ? i - 1 : i + 1;
    proof.push({
      sibling: level[siblingIndex] ?? level[i],
      position: isRight ? "left" : "right",
    });
    const next: string[] = [];
    for (let j = 0; j < level.length; j += 2) {
      next.push(hashPair(level[j], level[j + 1] ?? level[j]));
    }
    level = next;
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyMerkleProof(
  leaf: string,
  proof: MerkleProofStep[],
  root: string,
): boolean {
  let hash = leaf;
  for (const step of proof) {
    hash =
      step.position === "left" ? hashPair(step.sibling, hash) : hashPair(hash, step.sibling);
  }
  return hash === root;
}
