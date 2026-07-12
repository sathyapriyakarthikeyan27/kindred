/**
 * Step 6 verification (run with: npm run verify:dashboard).
 *
 * Builds one donor giving across two causes — one case fulfilled, one still
 * active — then proves:
 *   - partners can post field updates, but only the partner who verified the
 *     case, and never after consent is revoked
 *   - the dashboard aggregates correctly: totals, cases supported, lives
 *     touched, cause breakdown
 * Prints the donor's dashboard URL for a browser check.
 */
import { prisma } from "../src/lib/db";
import {
  WorkflowError,
  fulfillCase,
  intakeCase,
  submitForVerification,
  verifyCase,
  verifyMilestone,
} from "../src/lib/cases/workflow";
import { postStatusUpdate } from "../src/lib/cases/updates";
import { recordDonation } from "../src/lib/donations/service";
import { getDonorDashboard } from "../src/lib/donors/dashboard";

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

async function makeVerifiedCase(opts: {
  run: string;
  partnerId: string;
  tag: string;
  title: string;
  publicName: string;
  causeSlug: string;
  goalPaise: bigint;
}) {
  const kase = await intakeCase({
    beneficiary: {
      fullName: `Dashboard Demo ${opts.tag} ${opts.run} (private)`,
      publicName: opts.publicName,
    },
    consentScope: "NOTES_AND_PHOTOS",
    case: {
      title: opts.title,
      story: `Demo case for the donor dashboard verification (${opts.tag}).`,
      type: "INDIVIDUAL",
      goalPaise: opts.goalPaise,
      leftoverPolicy: "SIMILAR_CASE",
      causeSlug: opts.causeSlug,
    },
    milestones: [{ title: "Need fulfilled", amountPaise: opts.goalPaise }],
  });
  await prisma.beneficiary.update({
    where: { id: kase.beneficiaryId },
    data: { kycStatus: "VERIFIED" },
  });
  await submitForVerification(kase.id);
  await verifyCase(kase.id, opts.partnerId);
  return kase;
}

async function main() {
  const run = Date.now().toString(36);

  section("1. One donor, two causes");
  const partner = await prisma.verificationPartner.create({
    data: {
      orgName: `Dashboard Partner ${run}`,
      contactName: "Verifier",
      email: `dash-partner-${run}@kindred.test`,
      kycStatus: "VERIFIED",
    },
  });
  const health = await makeVerifiedCase({
    run,
    partnerId: partner.id,
    tag: "health",
    title: "Fund Meera's heart surgery",
    publicName: "a newborn in Coimbatore",
    causeSlug: "emergency-surgery",
    goalPaise: 50_000_00n,
  });
  const education = await makeVerifiedCase({
    run,
    partnerId: partner.id,
    tag: "education",
    title: "Keep Kavya in school this year",
    publicName: "a 12-year-old in rural Theni",
    causeSlug: "girl-child-education",
    goalPaise: 30_000_00n,
  });

  const donor = await prisma.user.create({
    data: { email: `dash-donor-${run}@kindred.test`, name: "Arjun M." },
  });
  await recordDonation({ donorId: donor.id, caseId: health.id, amountPaise: 3_000_00n });
  await recordDonation({ donorId: donor.id, caseId: health.id, amountPaise: 1_000_00n });
  await recordDonation({ donorId: donor.id, caseId: education.id, amountPaise: 1_500_00n });
  ok("3 donations recorded: ₹4,000 to surgery, ₹1,500 to education");

  section("2. Field updates, gated");
  await postStatusUpdate({
    caseId: health.id,
    partnerId: partner.id,
    body: "Meera has been admitted and surgery is scheduled for next week.",
  });
  ok("verifying partner posted a progress update");

  const stranger = await prisma.verificationPartner.create({
    data: {
      orgName: `Other Partner ${run}`,
      contactName: "Someone Else",
      email: `other-partner-${run}@kindred.test`,
      kycStatus: "VERIFIED",
    },
  });
  await expectWorkflowError(
    () =>
      postStatusUpdate({
        caseId: health.id,
        partnerId: stranger.id,
        body: "An update from a partner who never verified this case.",
      }),
    "update from a non-verifying partner",
  );

  await prisma.consentRecord.updateMany({
    where: { beneficiary: { cases: { some: { id: education.id } } } },
    data: { revokedAt: new Date() },
  });
  await expectWorkflowError(
    () =>
      postStatusUpdate({
        caseId: education.id,
        partnerId: partner.id,
        body: "This must not go out — consent was revoked.",
      }),
    "update after consent revoked",
  );

  section("3. A fulfilled case becomes a life touched");
  const milestone = await prisma.milestone.findFirstOrThrow({
    where: { caseId: health.id },
  });
  await verifyMilestone(milestone.id, partner.id, "Surgery completed successfully.");
  await fulfillCase(
    health.id,
    partner.id,
    "Meera's surgery went perfectly — she is home and thriving. Thank you.",
  );
  ok("health case FULFILLED with closing update");

  section("4. The dashboard aggregates");
  const dash = await getDonorDashboard(donor.id);
  if (!dash) throw new Error("dashboard not found");
  const { stats, causeBreakdown, impacts } = dash;
  if (stats.totalGivenPaise !== 5_500_00n)
    throw new Error(`total: expected 550000, got ${stats.totalGivenPaise}`);
  if (stats.casesSupported !== 2)
    throw new Error(`cases: expected 2, got ${stats.casesSupported}`);
  if (stats.donationCount !== 3)
    throw new Error(`donations: expected 3, got ${stats.donationCount}`);
  if (stats.livesTouched !== 1)
    throw new Error(`lives: expected 1, got ${stats.livesTouched}`);
  if (impacts.length !== 2)
    // two donations to the fulfilled case → two impact records, one life
    throw new Error(`impacts: expected 2 records, got ${impacts.length}`);
  if (
    causeBreakdown.length !== 2 ||
    causeBreakdown[0].name !== "Emergency surgery" ||
    causeBreakdown[0].amountPaise !== 4_000_00n ||
    causeBreakdown[1].amountPaise !== 1_500_00n
  )
    throw new Error(`cause breakdown wrong: ${JSON.stringify(causeBreakdown, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  ok("₹5,500 total · 2 cases · 3 donations · 1 life touched · breakdown ordered correctly");

  console.log(
    `\n🎉 Step 6 verified. Open http://localhost:3000/dashboard/${donor.id} to see it.\n   (email lookup: dash-donor-${run}@kindred.test)\n`,
  );
}

main()
  .catch((e) => {
    console.error("\n❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
