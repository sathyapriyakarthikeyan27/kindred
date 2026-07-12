import { CaseStatus, ConsentScope, LeftoverPolicy } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Case + verification workflow (spec §10, build order 13.2).
 *
 * The trust invariant this file enforces: NO unverified case is ever public.
 * A case reaches ACTIVE only through a verification partner's sign-off, and
 * sign-off itself is gated on beneficiary KYC + an unrevoked consent record.
 */

/** Domain failures — API routes map these to 4xx instead of 500. */
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

// The only legal lifecycle moves. Everything else is rejected.
const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  DRAFT: ["PENDING_VERIFICATION"],
  PENDING_VERIFICATION: ["ACTIVE", "DRAFT"], // partner can send back for fixes
  ACTIVE: ["FUNDED", "FULFILLED", "CLOSED_UNFULFILLED", "FROZEN"],
  FUNDED: ["FULFILLED", "CLOSED_UNFULFILLED", "FROZEN"],
  FULFILLED: [],
  CLOSED_UNFULFILLED: [],
  FROZEN: ["ACTIVE", "FUNDED", "CLOSED_UNFULFILLED"], // review outcome
};

function assertTransition(from: CaseStatus, to: CaseStatus) {
  if (!CASE_TRANSITIONS[from].includes(to)) {
    throw new WorkflowError(`Illegal case transition: ${from} → ${to}`);
  }
}

// ─────────────────────────── Intake ───────────────────────────

export interface MilestoneInput {
  title: string;
  amountPaise: bigint;
}

export interface CaseIntakeInput {
  beneficiary: {
    fullName: string;
    publicName: string;
    guardian?: string;
    city?: string;
  };
  consentScope: ConsentScope;
  case: {
    title: string;
    story: string;
    city?: string;
    type: "INDIVIDUAL" | "NGO_BACKED";
    goalPaise: bigint;
    leftoverPolicy: LeftoverPolicy;
    causeSlug: string;
  };
  milestones: MilestoneInput[];
}

/**
 * Beneficiary intake: creates the beneficiary (KYC pending), their consent
 * record, and a DRAFT case with its milestone tranches — one transaction.
 * The leftover policy is agreed here, at creation, per spec §9.4.
 */
export async function intakeCase(input: CaseIntakeInput) {
  if (input.milestones.length === 0) {
    throw new WorkflowError("A case needs at least one milestone tranche.");
  }
  const trancheSum = input.milestones.reduce((s, m) => s + m.amountPaise, 0n);
  if (trancheSum !== input.case.goalPaise) {
    throw new WorkflowError(
      `Milestone tranches (${trancheSum} paise) must sum exactly to the goal (${input.case.goalPaise} paise).`,
    );
  }

  const { causeSlug, ...caseData } = input.case;
  const cause = await prisma.cause.findUnique({ where: { slug: causeSlug } });
  if (!cause || !cause.isActive) {
    throw new WorkflowError(`Unknown or inactive cause: ${causeSlug}`);
  }

  return prisma.$transaction(async (tx) => {
    const beneficiary = await tx.beneficiary.create({
      data: {
        ...input.beneficiary,
        consents: { create: { scope: input.consentScope, version: 1 } },
      },
    });
    return tx.case.create({
      data: {
        ...caseData,
        causeId: cause.id,
        beneficiaryId: beneficiary.id,
        status: "DRAFT",
        milestones: {
          create: input.milestones.map((m, i) => ({ ...m, ord: i + 1 })),
        },
      },
      include: { milestones: true, beneficiary: true },
    });
  });
}

// ─────────────────────────── Lifecycle ───────────────────────────

/** DRAFT → PENDING_VERIFICATION. Requires an unrevoked consent record. */
export async function submitForVerification(caseId: string) {
  const kase = await getCase(caseId);
  assertTransition(kase.status, "PENDING_VERIFICATION");

  const consent = await prisma.consentRecord.findFirst({
    where: { beneficiaryId: kase.beneficiaryId, revokedAt: null },
  });
  if (!consent) {
    throw new WorkflowError(
      "Cannot submit: the beneficiary has no active consent record (spec §11 — sharing is opt-in).",
    );
  }

  return prisma.case.update({
    where: { id: caseId },
    data: { status: "PENDING_VERIFICATION" },
  });
}

/**
 * Partner sign-off: PENDING_VERIFICATION → ACTIVE (public).
 * Gates: partner is active + KYC-verified; beneficiary is KYC-verified.
 * This is the moment "no unverified case is ever public" is enforced.
 */
export async function verifyCase(caseId: string, partnerId: string) {
  const kase = await getCase(caseId);
  assertTransition(kase.status, "ACTIVE");

  const partner = await prisma.verificationPartner.findUnique({ where: { id: partnerId } });
  if (!partner || !partner.active) {
    throw new WorkflowError("Verification partner not found or inactive.");
  }
  if (partner.kycStatus !== "VERIFIED") {
    throw new WorkflowError("Verification partner has not completed KYC.");
  }

  const beneficiary = await prisma.beneficiary.findUniqueOrThrow({
    where: { id: kase.beneficiaryId },
  });
  if (beneficiary.kycStatus !== "VERIFIED") {
    throw new WorkflowError(
      "Cannot publish: beneficiary KYC is not verified (spec §9.5).",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.case.update({
      where: { id: caseId },
      data: { status: "ACTIVE", verifiedById: partnerId, publishedAt: new Date() },
    });
    await tx.statusUpdate.create({
      data: {
        caseId,
        kind: "PROGRESS",
        body: `Case verified by ${partner.orgName} and published.`,
        authorPartnerId: partnerId,
      },
    });
    return updated;
  });
}

/** Partner sends a pending case back for fixes instead of approving it. */
export async function returnCaseToDraft(caseId: string, reason: string) {
  const kase = await getCase(caseId);
  assertTransition(kase.status, "DRAFT");
  return prisma.case.update({ where: { id: caseId }, data: { status: "DRAFT" } }).then(
    async (updated) => {
      await prisma.statusUpdate.create({
        data: { caseId, kind: "PROGRESS", body: `Returned for fixes: ${reason}` },
      });
      return updated;
    },
  );
}

/**
 * Milestone sign-off: PENDING → VERIFIED. This is what makes an escrow
 * tranche eligible for release (the actual disbursement is build-order
 * step 3, Razorpay Route). Posts the structured MILESTONE update donors see.
 */
export async function verifyMilestone(milestoneId: string, partnerId: string, note?: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { case: true },
  });
  if (!milestone) throw new WorkflowError("Milestone not found.");
  if (milestone.status !== "PENDING") {
    throw new WorkflowError(`Milestone is ${milestone.status}, expected PENDING.`);
  }
  if (milestone.case.status !== "ACTIVE" && milestone.case.status !== "FUNDED") {
    throw new WorkflowError(
      `Milestones can only be verified on ACTIVE/FUNDED cases (case is ${milestone.case.status}).`,
    );
  }
  const partner = await prisma.verificationPartner.findUnique({ where: { id: partnerId } });
  if (!partner || !partner.active || partner.kycStatus !== "VERIFIED") {
    throw new WorkflowError("Verification partner not found, inactive, or not KYC-verified.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.milestone.update({
      where: { id: milestoneId },
      data: { status: "VERIFIED", verifiedById: partnerId, verifiedAt: new Date() },
    });
    await tx.statusUpdate.create({
      data: {
        caseId: milestone.caseId,
        milestoneId,
        kind: "MILESTONE",
        body: note ?? `Milestone reached: ${milestone.title}`,
        authorPartnerId: partnerId,
      },
    });
    return updated;
  });
}

/** Flag → FROZEN: pauses everything pending Trust & Safety review (spec §10). */
export async function freezeCase(caseId: string, reason: string) {
  const kase = await getCase(caseId);
  assertTransition(kase.status, "FROZEN");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.case.update({ where: { id: caseId }, data: { status: "FROZEN" } });
    await tx.statusUpdate.create({
      data: { caseId, kind: "PROGRESS", body: `Case frozen pending review: ${reason}` },
    });
    return updated;
  });
}

/**
 * The closing moment (spec §6): case → FULFILLED, a CLOSING update goes out,
 * and an ImpactRecord is written for every donation so each donor's
 * "lives touched" dashboard gains this case.
 */
export async function fulfillCase(caseId: string, partnerId: string, closingMessage: string) {
  const kase = await getCase(caseId);
  assertTransition(kase.status, "FULFILLED");

  const unfinished = await prisma.milestone.count({
    where: { caseId, status: "PENDING" },
  });
  if (unfinished > 0) {
    throw new WorkflowError(
      `Cannot fulfill: ${unfinished} milestone(s) still pending verification.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.case.update({
      where: { id: caseId },
      data: { status: "FULFILLED", fulfilledAt: new Date() },
    });
    await tx.statusUpdate.create({
      data: {
        caseId,
        kind: "CLOSING",
        body: closingMessage,
        authorPartnerId: partnerId,
      },
    });
    const donations = await tx.donation.findMany({
      where: { targetCaseId: caseId, status: { not: "REFUNDED" } },
      select: { id: true },
    });
    for (const donation of donations) {
      await tx.impactRecord.upsert({
        where: { caseId_donationId: { caseId, donationId: donation.id } },
        update: {},
        create: {
          caseId,
          donationId: donation.id,
          summary: `Your contribution helped fulfil "${kase.title}" (Case #${kase.caseNumber}).`,
        },
      });
    }
    return updated;
  });
}

async function getCase(caseId: string) {
  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase) throw new WorkflowError("Case not found.");
  return kase;
}
