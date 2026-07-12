import { UpdateKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { WorkflowError } from "@/lib/cases/workflow";

/**
 * Field updates (spec §6): verified updaters only, and what donors may see
 * is bounded by the beneficiary's consent scope. CLOSING/MILESTONE updates
 * are posted by the workflow (fulfillCase / verifyMilestone) — this is the
 * free-form PROGRESS channel partners use between milestones.
 */
export async function postStatusUpdate(input: {
  caseId: string;
  partnerId: string;
  body: string;
  kind?: Extract<UpdateKind, "PROGRESS" | "CLOSURE">;
}) {
  const kase = await prisma.case.findUnique({
    where: { id: input.caseId },
    include: { beneficiary: { include: { consents: { where: { revokedAt: null } } } } },
  });
  if (!kase) throw new WorkflowError("Case not found.");
  if (!["ACTIVE", "FUNDED", "FULFILLED"].includes(kase.status)) {
    throw new WorkflowError(`Updates can't be posted on a ${kase.status} case.`);
  }

  const partner = await prisma.verificationPartner.findUnique({
    where: { id: input.partnerId },
  });
  if (!partner || !partner.active || partner.kycStatus !== "VERIFIED") {
    throw new WorkflowError("Only active, KYC-verified partners can post updates.");
  }
  // Only the partner who verified the case reports on it
  if (kase.verifiedById !== partner.id) {
    throw new WorkflowError("Updates must come from the partner who verified this case.");
  }

  if (kase.beneficiary.consents.length === 0) {
    throw new WorkflowError(
      "The beneficiary's consent has been revoked — no further updates may be shared (spec §11).",
    );
  }

  return prisma.statusUpdate.create({
    data: {
      caseId: input.caseId,
      kind: input.kind ?? "PROGRESS",
      body: input.body,
      authorPartnerId: partner.id,
    },
  });
}
