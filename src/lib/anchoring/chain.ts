import { JsonRpcProvider, Wallet } from "ethers";
import { prisma } from "@/lib/db";

/**
 * On-chain submission (script-only — never imported by pages).
 *
 * Writes an anchor's Merkle root to Polygon as transaction calldata: a
 * 0-value self-transfer whose data is the 32-byte root. Cheap (~21k gas +
 * data), permanent, and verifiable by anyone from the tx alone.
 *
 * Config (env):
 *   POLYGON_RPC_URL      e.g. https://rpc-amoy.polygon.technology
 *   POLYGON_PRIVATE_KEY  funded test wallet (Amoy faucet POL is free)
 *   POLYGON_NETWORK      label stored on the anchor (default polygon-amoy)
 */

export function chainConfigured(): boolean {
  return Boolean(process.env.POLYGON_RPC_URL && process.env.POLYGON_PRIVATE_KEY);
}

export async function submitAnchor(anchorId: string) {
  const anchor = await prisma.anchor.findUniqueOrThrow({ where: { id: anchorId } });
  if (anchor.status === "CONFIRMED") return anchor;
  if (!chainConfigured()) {
    throw new Error(
      "Polygon not configured: set POLYGON_RPC_URL and POLYGON_PRIVATE_KEY in .env " +
        "(anchor stays PENDING; its root is already fixed locally).",
    );
  }

  const provider = new JsonRpcProvider(process.env.POLYGON_RPC_URL);
  const wallet = new Wallet(process.env.POLYGON_PRIVATE_KEY!, provider);

  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: 0n,
    data: `0x${anchor.merkleRoot}`,
  });
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Anchor transaction failed: ${tx.hash}`);
  }

  return prisma.anchor.update({
    where: { id: anchorId },
    data: {
      txHash: tx.hash,
      network: process.env.POLYGON_NETWORK ?? "polygon-amoy",
      status: "CONFIRMED",
      anchoredAt: new Date(),
    },
  });
}
