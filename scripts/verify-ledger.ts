/**
 * End-to-end proof that step 1 works (run with: npm run verify:ledger).
 *
 * Walks the spec §4 money flow with demo data —
 *   donation → allocation → disbursement, each as a hash-chained ledger entry —
 * then proves the guarantees:
 *   1. the hash chain verifies,
 *   2. the append-only trigger rejects UPDATE and DELETE,
 *   3. a Merkle root + proof over the entries verifies (the §5 anchoring math).
 *
 * Demo rows are tagged and re-created per run; ledger entries are permanent
 * by design (append-only), which is itself part of the demonstration.
 */
import { prisma } from "../src/lib/db";
import { appendLedgerEntry, verifyLedgerChain } from "../src/lib/ledger/ledger";
import {
  buildMerkleRoot,
  getMerkleProof,
  verifyMerkleProof,
} from "../src/lib/ledger/merkle";

const ok = (msg: string) => console.log(`  ✅ ${msg}`);
const section = (msg: string) => console.log(`\n${msg}`);

async function main() {
  const run = Date.now().toString(36);

  section("1. Demo actors (donor, beneficiary+consent, partner, provider)");
  const donor = await prisma.user.create({
    data: { email: `demo-donor-${run}@kindred.test`, name: "Demo Donor" },
  });
  const beneficiary = await prisma.beneficiary.create({
    data: {
      fullName: "Demo Beneficiary (private)",
      publicName: "a 7-year-old in Chennai",
      city: "Chennai",
      kycStatus: "VERIFIED",
      consents: { create: { scope: "MILESTONES_ONLY", version: 1 } },
    },
  });
  const partner = await prisma.verificationPartner.create({
    data: {
      orgName: "Demo NGO",
      contactName: "Field Verifier",
      email: `demo-partner-${run}@kindred.test`,
      kycStatus: "VERIFIED",
    },
  });
  const provider = await prisma.provider.create({
    data: { name: "Demo Hospital", kind: "HOSPITAL", bankVerified: true },
  });
  ok("actors created (beneficiary consent: MILESTONES_ONLY, versioned)");

  section("2. Verified case with milestone tranches (spec §4.1)");
  const cause = await prisma.cause.findUniqueOrThrow({ where: { slug: "pediatric-cancer" } });
  const kase = await prisma.case.create({
    data: {
      title: `Demo case ${run}`,
      story: "Demo pediatric treatment case.",
      city: "Chennai",
      type: "INDIVIDUAL",
      status: "ACTIVE",
      goalPaise: 500_000_00n, // ₹5,00,000
      leftoverPolicy: "SIMILAR_CASE",
      causeId: cause.id,
      beneficiaryId: beneficiary.id,
      verifiedById: partner.id,
      publishedAt: new Date(),
      milestones: {
        create: [
          { ord: 1, title: "Admission confirmed", amountPaise: 150_000_00n },
          { ord: 2, title: "Treatment underway", amountPaise: 250_000_00n },
          { ord: 3, title: "Post-treatment care", amountPaise: 100_000_00n },
        ],
      },
    },
    include: { milestones: true },
  });
  ok(`Case #${kase.caseNumber} under "${cause.name}" with ${kase.milestones.length} tranches`);

  section("3. The money flow, each hop a ledger entry (spec §4)");
  const donation = await prisma.donation.create({
    data: {
      donorId: donor.id,
      amountPaise: 2_000_00n, // ₹2,000
      status: "HELD",
      targetCaseId: kase.id,
      paymentRef: `demo_pay_${run}`,
    },
  });
  await appendLedgerEntry({
    kind: "DONATION_RECEIVED",
    amountPaise: donation.amountPaise,
    donationId: donation.id,
    caseId: kase.id,
    payload: { donationNumber: `D-${donation.donationNumber}`, paymentRef: donation.paymentRef },
  });
  ok(`D-${donation.donationNumber}: ₹2,000 received into escrow → ledger`);

  const allocation = await prisma.allocation.create({
    data: {
      donationId: donation.id,
      caseId: kase.id,
      milestoneId: kase.milestones[0].id,
      amountPaise: donation.amountPaise,
    },
  });
  await appendLedgerEntry({
    kind: "ALLOCATION",
    amountPaise: allocation.amountPaise,
    donationId: donation.id,
    allocationId: allocation.id,
    caseId: kase.id,
    payload: { milestone: kase.milestones[0].title },
  });
  ok(`allocated to milestone "${kase.milestones[0].title}" → ledger`);

  const disbursement = await prisma.disbursement.create({
    data: {
      milestoneId: kase.milestones[0].id,
      providerId: provider.id,
      amountPaise: allocation.amountPaise,
      status: "SETTLED",
      paymentRef: `demo_payout_${run}`,
      settledAt: new Date(),
      proofs: {
        create: {
          kind: "INVOICE",
          storageKey: `demo/invoices/${run}.pdf`,
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
      },
    },
    include: { proofs: true },
  });
  await appendLedgerEntry({
    kind: "DISBURSEMENT",
    amountPaise: disbursement.amountPaise,
    donationId: donation.id,
    disbursementId: disbursement.id,
    caseId: kase.id,
    payload: {
      provider: provider.name,
      paymentRef: disbursement.paymentRef,
      proofSha256: disbursement.proofs[0].sha256, // evidence committed into the chain
    },
  });
  ok(`disbursed direct to "${provider.name}" with invoice proof → ledger`);

  section("4. Guarantee: hash chain verifies end-to-end (spec §4.3)");
  const chain = await verifyLedgerChain(prisma);
  if (!chain.ok) throw new Error(`CHAIN BROKEN: ${chain.error}`);
  ok(`chain valid across ${chain.entriesChecked} entries`);

  section("5. Guarantee: ledger is append-only (Postgres trigger)");
  const someEntry = await prisma.ledgerEntry.findFirstOrThrow({ orderBy: { seq: "asc" } });
  try {
    await prisma.$executeRaw`UPDATE "ledger_entries" SET "amountPaise" = 1 WHERE "id" = ${someEntry.id}`;
    throw new Error("UPDATE was allowed — trigger missing!");
  } catch (e) {
    if (e instanceof Error && e.message.includes("append-only")) ok("UPDATE rejected by trigger");
    else throw e;
  }
  try {
    await prisma.$executeRaw`DELETE FROM "ledger_entries" WHERE "id" = ${someEntry.id}`;
    throw new Error("DELETE was allowed — trigger missing!");
  } catch (e) {
    if (e instanceof Error && e.message.includes("append-only")) ok("DELETE rejected by trigger");
    else throw e;
  }

  section("6. Guarantee: Merkle anchoring math works (spec §5)");
  const entries = await prisma.ledgerEntry.findMany({ orderBy: { seq: "asc" } });
  const leaves = entries.map((e) => e.entryHash);
  const root = buildMerkleRoot(leaves);
  const idx = leaves.length - 1;
  const proof = getMerkleProof(leaves, idx);
  if (!verifyMerkleProof(leaves[idx], proof, root)) throw new Error("Merkle proof failed");
  ok(`root ${root.slice(0, 16)}… computed over ${leaves.length} leaves; proof verifies`);
  const anchor = await prisma.anchor.create({
    data: { fromSeq: entries[0].seq, toSeq: entries[idx].seq, merkleRoot: root },
  });
  ok(`Anchor recorded (seq ${anchor.fromSeq}–${anchor.toSeq}, status PENDING — Polygon tx is build-order step 5)`);

  console.log("\n🎉 Step 1 verified: the money trail records, chains, and proves.\n");
}

main()
  .catch((e) => {
    console.error("\n❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
