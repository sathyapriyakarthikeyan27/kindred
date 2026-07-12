/**
 * Step 2 verification (run with: npm run verify:workflow).
 *
 * Drives the case + verification workflow end-to-end:
 *   intake (DRAFT) → submit → partner sign-off (ACTIVE) → milestone
 *   verification → fulfillment (CLOSING update + impact records)
 * and proves the trust gates hold:
 *   - a case cannot go public without partner sign-off + beneficiary KYC
 *   - milestones must sum exactly to the goal
 *   - illegal lifecycle transitions are rejected
 *   - frozen cases pause milestone verification
 */
import { prisma } from "../src/lib/db";
import {
  WorkflowError,
  freezeCase,
  fulfillCase,
  intakeCase,
  submitForVerification,
  verifyCase,
  verifyMilestone,
} from "../src/lib/cases/workflow";

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

  section("1. Intake gates");
  await expectWorkflowError(
    () =>
      intakeCase({
        beneficiary: { fullName: "Bad Case", publicName: "someone" },
        consentScope: "MILESTONES_ONLY",
        case: {
          title: "Tranches don't sum",
          story: "Milestones must sum exactly to the goal amount.",
          type: "INDIVIDUAL",
          goalPaise: 100_000_00n,
          leftoverPolicy: "SIMILAR_CASE",
          causeSlug: "leukemia",
        },
        milestones: [{ title: "Only half", amountPaise: 50_000_00n }],
      }),
    "tranches ≠ goal",
  );

  const kase = await intakeCase({
    beneficiary: {
      fullName: `Workflow Demo ${run} (private)`,
      publicName: "a college student in Madurai",
      city: "Madurai",
    },
    consentScope: "NOTES_AND_PHOTOS",
    case: {
      title: `Workflow demo case ${run}`,
      story: "Demo case exercising the full verification workflow.",
      city: "Madurai",
      type: "INDIVIDUAL",
      goalPaise: 100_000_00n, // ₹1,00,000
      leftoverPolicy: "CAUSE_POOL",
      causeSlug: "leukemia",
    },
    milestones: [
      { title: "Admission confirmed", amountPaise: 40_000_00n },
      { title: "Treatment complete", amountPaise: 60_000_00n },
    ],
  });
  ok(`intake created Case #${kase.caseNumber} as DRAFT with consent v1 (NOTES_AND_PHOTOS)`);

  section("2. Lifecycle gates on the way to ACTIVE");
  const partner = await prisma.verificationPartner.create({
    data: {
      orgName: `Demo Partner ${run}`,
      contactName: "Verifier",
      email: `partner-${run}@kindred.test`,
      kycStatus: "VERIFIED",
    },
  });

  await expectWorkflowError(() => verifyCase(kase.id, partner.id), "verify a DRAFT (illegal transition)");

  await submitForVerification(kase.id);
  ok("DRAFT → PENDING_VERIFICATION (consent check passed)");

  await expectWorkflowError(
    () => verifyCase(kase.id, partner.id),
    "publish with beneficiary KYC still PENDING",
  );

  await prisma.beneficiary.update({
    where: { id: kase.beneficiaryId },
    data: { kycStatus: "VERIFIED" },
  });
  await verifyCase(kase.id, partner.id);
  ok("partner sign-off: PENDING_VERIFICATION → ACTIVE (published, update posted)");

  section("3. Milestones + freeze behaviour");
  const [m1, m2] = await prisma.milestone.findMany({
    where: { caseId: kase.id },
    orderBy: { ord: "asc" },
  });

  await verifyMilestone(m1.id, partner.id, "Hospital confirmed admission with documents.");
  ok(`milestone 1 "${m1.title}" verified → release-eligible`);

  await freezeCase(kase.id, "Routine document re-check (demo).");
  await expectWorkflowError(
    () => verifyMilestone(m2.id, partner.id),
    "verify milestone on a FROZEN case",
  );
  await prisma.case.update({ where: { id: kase.id }, data: { status: "ACTIVE" } });
  ok("case unfrozen after review");

  section("4. The closing moment");
  await expectWorkflowError(
    () => fulfillCase(kase.id, partner.id, "Too early — milestone 2 still pending."),
    "fulfill with a pending milestone",
  );

  await verifyMilestone(m2.id, partner.id, "Treatment completed successfully.");

  // a donation so fulfillment has a donor to write an impact record for
  const donor = await prisma.user.create({
    data: { email: `workflow-donor-${run}@kindred.test`, name: "Workflow Donor" },
  });
  await prisma.donation.create({
    data: { donorId: donor.id, amountPaise: 5_000_00n, status: "HELD", targetCaseId: kase.id },
  });

  await fulfillCase(
    kase.id,
    partner.id,
    "Treatment is complete and they are back in college. Thank you for being part of this.",
  );

  const closing = await prisma.statusUpdate.findFirst({
    where: { caseId: kase.id, kind: "CLOSING" },
  });
  const impact = await prisma.impactRecord.count({ where: { caseId: kase.id } });
  if (!closing) throw new Error("CLOSING update missing");
  if (impact !== 1) throw new Error(`expected 1 impact record, found ${impact}`);
  ok(`case FULFILLED — CLOSING update posted, ${impact} impact record written for the donor`);

  console.log("\n🎉 Step 2 verified: no unverified case can go public, and the loop closes.\n");
}

main()
  .catch((e) => {
    console.error("\n❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
