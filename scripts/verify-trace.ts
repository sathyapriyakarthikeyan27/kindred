/**
 * Step 4 verification (run with: npm run verify:trace).
 *
 * Builds one complete donor journey through the real services —
 *   verified case → donation → allocation → milestone sign-off →
 *   disbursement with invoice proof → fulfillment (closing update)
 * — proving the money-flow gates along the way, then checks the trace
 * assembles the full trail. Prints the donation number so the trail can
 * be opened in the browser at /trace/<n>.
 */
import { prisma } from "../src/lib/db";
import { verifyLedgerChain } from "../src/lib/ledger/ledger";
import {
  WorkflowError,
  fulfillCase,
  intakeCase,
  submitForVerification,
  verifyCase,
  verifyMilestone,
} from "../src/lib/cases/workflow";
import {
  allocateDonation,
  getDonationTrace,
  recordDisbursement,
  recordDonation,
} from "../src/lib/donations/service";

const ok = (msg: string) => console.log(`  ✅ ${msg}`);
const section = (msg: string) => console.log(`\n${msg}`);

async function expectWorkflowError(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof WorkflowError) {
      ok(`${label} → rejected: "${e.message}"`);
      return;
    }
    throw e;
  }
  throw new Error(`Expected WorkflowError: ${label}`);
}

async function main() {
  const run = Date.now().toString(36);

  section("1. A verified case, ready for donations");
  const partner = await prisma.verificationPartner.create({
    data: {
      orgName: "Chennai Care Network",
      contactName: "Field Verifier",
      email: `trace-partner-${run}@kindred.test`,
      kycStatus: "VERIFIED",
    },
  });
  const provider = await prisma.provider.create({
    data: { name: "Sunrise Children's Hospital", kind: "HOSPITAL", bankVerified: true },
  });
  const kase = await intakeCase({
    beneficiary: {
      fullName: `Trace Demo ${run} (private)`,
      publicName: "a 9-year-old cricket fan in Chennai",
      city: "Chennai",
    },
    consentScope: "NOTES_AND_PHOTOS",
    case: {
      title: "Complete Aarav's leukemia treatment",
      story: "Aarav is midway through chemotherapy and his family has run out of savings.",
      city: "Chennai",
      type: "INDIVIDUAL",
      goalPaise: 300_000_00n,
      leftoverPolicy: "SIMILAR_CASE",
      causeSlug: "pediatric-cancer",
    },
    milestones: [
      { title: "Chemotherapy cycle paid", amountPaise: 200_000_00n },
      { title: "Recovery care & follow-ups", amountPaise: 100_000_00n },
    ],
  });
  await prisma.beneficiary.update({
    where: { id: kase.beneficiaryId },
    data: { kycStatus: "VERIFIED" },
  });
  await submitForVerification(kase.id);
  await verifyCase(kase.id, partner.id);
  ok(`Case #${kase.caseNumber} verified and ACTIVE`);

  section("2. The donation, with money-flow gates");
  const donor = await prisma.user.create({
    data: { email: `trace-donor-${run}@kindred.test`, name: "Priya S." },
  });
  const donation = await recordDonation({
    donorId: donor.id,
    caseId: kase.id,
    amountPaise: 2_000_00n, // ₹2,000
    paymentRef: `pay_demo_${run}`,
  });
  ok(`D-${donation.donationNumber}: ₹2,000 received into escrow → ledger`);

  const [m1, m2] = kase.milestones;

  await expectWorkflowError(
    () =>
      allocateDonation({ donationId: donation.id, milestoneId: m1.id, amountPaise: 5_000_00n }),
    "allocate more than the donation",
  );
  await allocateDonation({
    donationId: donation.id,
    milestoneId: m1.id,
    amountPaise: donation.amountPaise,
  });
  ok(`fully allocated to "${m1.title}" → ledger`);

  await expectWorkflowError(
    () =>
      recordDisbursement({
        milestoneId: m1.id,
        providerId: provider.id,
        amountPaise: 2_000_00n,
        proof: {
          kind: "INVOICE",
          storageKey: `proofs/${run}.pdf`,
          sha256: "a".repeat(64),
        },
      }),
    "disburse before milestone verification",
  );

  await verifyMilestone(m1.id, partner.id, "Hospital confirmed the chemo cycle is paid for.");
  const disbursement = await recordDisbursement({
    milestoneId: m1.id,
    providerId: provider.id,
    amountPaise: 2_000_00n,
    paymentRef: `payout_demo_${run}`,
    proof: {
      kind: "INVOICE",
      storageKey: `proofs/invoice-${run}.pdf`,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  });
  ok(`released ₹2,000 direct to ${provider.name}, invoice attached → ledger`);
  void disbursement;

  section("3. The closing moment");
  await verifyMilestone(m2.id, partner.id, "Follow-up plan confirmed with the family.");
  await fulfillCase(
    kase.id,
    partner.id,
    "Aarav finished his final chemo cycle and is back home — and back to cricket. Thank you.",
  );
  ok("case FULFILLED, closing update posted, impact recorded");

  section("4. The trail assembles");
  const trace = await getDonationTrace(donation.donationNumber);
  if (!trace) throw new Error("trace not found");
  const kinds = trace.donation.ledgerEntries.map((e) => e.kind);
  if (JSON.stringify(kinds) !== JSON.stringify(["DONATION_RECEIVED", "ALLOCATION", "DISBURSEMENT"])) {
    throw new Error(`unexpected trail: ${kinds.join(", ")}`);
  }
  const proofCount = trace.donation.allocations
    .flatMap((a) => a.milestone?.disbursements ?? [])
    .flatMap((d) => d.proofs).length;
  if (proofCount < 1) throw new Error("no proof in trail");
  const hasClosing = trace.donation.targetCase!.statusUpdates.some((u) => u.kind === "CLOSING");
  if (!hasClosing) throw new Error("closing update missing from trail");
  ok("trail = received → allocated → disbursed, with invoice proof and closing update");

  const chain = await verifyLedgerChain(prisma);
  if (!chain.ok) throw new Error(`ledger chain broken: ${chain.error}`);
  ok(`ledger chain still valid across ${chain.entriesChecked} entries`);

  console.log(
    `\n🎉 Step 4 verified. Open http://localhost:3000/trace/${donation.donationNumber} to see the trail.\n`,
  );
}

main()
  .catch((e) => {
    console.error("\n❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
