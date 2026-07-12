import { ProofKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { appendLedgerEntry } from "@/lib/ledger/ledger";
import { WorkflowError } from "@/lib/cases/workflow";

/**
 * The money flow (spec §4): donation → allocation → disbursement, every hop
 * a hash-chained ledger entry. Build-order step 3 (Razorpay Route) will slot
 * into recordDonation/recordDisbursement as the gateway that actually moves
 * money; the recording, gating, and trace semantics here don't change.
 */

/** Donor gives to a specific verified case (pools are v2). */
export async function recordDonation(input: {
  donorId: string;
  caseId: string;
  amountPaise: bigint;
  paymentRef?: string;
  optInUpdates?: boolean;
}) {
  const kase = await prisma.case.findUnique({ where: { id: input.caseId } });
  if (!kase) throw new WorkflowError("Case not found.");
  if (kase.status !== "ACTIVE" && kase.status !== "FUNDED") {
    throw new WorkflowError(`Case is not accepting donations (status: ${kase.status}).`);
  }

  const donation = await prisma.$transaction(async (tx) => {
    const created = await tx.donation.create({
      data: {
        donorId: input.donorId,
        targetCaseId: input.caseId,
        amountPaise: input.amountPaise,
        status: "HELD",
        paymentRef: input.paymentRef,
        optInUpdates: input.optInUpdates ?? true,
      },
    });
    const raised = await tx.case.update({
      where: { id: input.caseId },
      data: { raisedPaise: { increment: input.amountPaise } },
      select: { raisedPaise: true, goalPaise: true, status: true },
    });
    if (raised.raisedPaise >= raised.goalPaise && raised.status === "ACTIVE") {
      await tx.case.update({ where: { id: input.caseId }, data: { status: "FUNDED" } });
    }
    return created;
  });

  await appendLedgerEntry({
    kind: "DONATION_RECEIVED",
    amountPaise: donation.amountPaise,
    donationId: donation.id,
    caseId: input.caseId,
    payload: {
      donationNumber: `D-${donation.donationNumber}`,
      paymentRef: donation.paymentRef ?? null,
    },
  });

  return donation;
}

/** Earmark held funds to a milestone tranche. */
export async function allocateDonation(input: {
  donationId: string;
  milestoneId: string;
  amountPaise: bigint;
}) {
  const donation = await prisma.donation.findUnique({
    where: { id: input.donationId },
    include: { allocations: true },
  });
  if (!donation) throw new WorkflowError("Donation not found.");
  if (donation.status !== "HELD" && donation.status !== "ALLOCATED") {
    throw new WorkflowError(`Donation is ${donation.status}; only held funds can be allocated.`);
  }
  const alreadyAllocated = donation.allocations.reduce((s, a) => s + a.amountPaise, 0n);
  if (alreadyAllocated + input.amountPaise > donation.amountPaise) {
    throw new WorkflowError(
      `Allocation exceeds the donation: ${alreadyAllocated + input.amountPaise} > ${donation.amountPaise} paise.`,
    );
  }
  const milestone = await prisma.milestone.findUnique({ where: { id: input.milestoneId } });
  if (!milestone) throw new WorkflowError("Milestone not found.");
  if (milestone.caseId !== donation.targetCaseId) {
    throw new WorkflowError("Milestone belongs to a different case than the donation target.");
  }

  const allocation = await prisma.$transaction(async (tx) => {
    const created = await tx.allocation.create({
      data: {
        donationId: donation.id,
        caseId: milestone.caseId,
        milestoneId: milestone.id,
        amountPaise: input.amountPaise,
      },
    });
    const fullyAllocated = alreadyAllocated + input.amountPaise === donation.amountPaise;
    await tx.donation.update({
      where: { id: donation.id },
      data: { status: fullyAllocated ? "ALLOCATED" : "HELD" },
    });
    return created;
  });

  await appendLedgerEntry({
    kind: "ALLOCATION",
    amountPaise: allocation.amountPaise,
    donationId: donation.id,
    allocationId: allocation.id,
    caseId: milestone.caseId,
    payload: { milestone: milestone.title, milestoneOrd: milestone.ord },
  });

  return allocation;
}

/**
 * Pay a VERIFIED milestone tranche direct-to-provider, with proof attached
 * at recording time — a disbursement without evidence never enters the trail.
 */
export async function recordDisbursement(input: {
  milestoneId: string;
  providerId: string;
  amountPaise: bigint;
  paymentRef?: string;
  proof: { kind: ProofKind; storageKey: string; sha256: string; redactedKey?: string };
}) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: input.milestoneId },
    include: { case: true, allocations: true },
  });
  if (!milestone) throw new WorkflowError("Milestone not found.");
  if (milestone.status !== "VERIFIED") {
    throw new WorkflowError(
      `Escrow releases only against verified milestones (milestone is ${milestone.status}).`,
    );
  }
  if (milestone.case.status === "FROZEN") {
    throw new WorkflowError("Case is frozen; disbursements are paused (spec §10).");
  }
  const provider = await prisma.provider.findUnique({ where: { id: input.providerId } });
  if (!provider) throw new WorkflowError("Provider not found.");
  if (!provider.bankVerified) {
    throw new WorkflowError("Provider bank details are not verified (spec §9.5).");
  }
  const funded = milestone.allocations.reduce((s, a) => s + a.amountPaise, 0n);
  if (input.amountPaise > funded) {
    throw new WorkflowError(
      `Disbursement exceeds allocated funds for this milestone: ${input.amountPaise} > ${funded} paise.`,
    );
  }

  const disbursement = await prisma.$transaction(async (tx) => {
    const created = await tx.disbursement.create({
      data: {
        milestoneId: milestone.id,
        providerId: provider.id,
        amountPaise: input.amountPaise,
        status: "SETTLED", // step 3: becomes INITIATED → gateway webhook → SETTLED
        paymentRef: input.paymentRef,
        settledAt: new Date(),
        proofs: { create: input.proof },
      },
      include: { proofs: true },
    });
    await tx.milestone.update({ where: { id: milestone.id }, data: { status: "RELEASED" } });
    return created;
  });

  await appendLedgerEntry({
    kind: "DISBURSEMENT",
    amountPaise: disbursement.amountPaise,
    disbursementId: disbursement.id,
    caseId: milestone.caseId,
    payload: {
      provider: provider.name,
      milestone: milestone.title,
      paymentRef: disbursement.paymentRef ?? null,
      proofSha256: disbursement.proofs[0].sha256,
    },
  });

  return disbursement;
}

/**
 * The donor-facing trail (spec §4.2): everything a donor sees when they
 * "track their donation like a package". Only redacted proof copies and the
 * beneficiary's public name ever leave this function.
 */
export async function getDonationTrace(donationNumber: number) {
  const donation = await prisma.donation.findUnique({
    where: { donationNumber },
    include: {
      donor: { select: { name: true } },
      targetCase: {
        select: {
          caseNumber: true,
          title: true,
          status: true,
          goalPaise: true,
          raisedPaise: true,
          cause: { select: { name: true, slug: true } },
          beneficiary: { select: { publicName: true } },
          statusUpdates: {
            orderBy: { publishedAt: "asc" },
            select: { kind: true, body: true, publishedAt: true },
          },
        },
      },
      allocations: {
        include: {
          milestone: {
            select: {
              ord: true,
              title: true,
              status: true,
              disbursements: {
                select: {
                  id: true,
                  amountPaise: true,
                  status: true,
                  settledAt: true,
                  provider: { select: { name: true, kind: true } },
                  proofs: {
                    select: { kind: true, sha256: true, redactedKey: true, createdAt: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!donation || !donation.targetCase) return null;

  // The trail: entries recorded against this donation directly, plus the
  // disbursements of the milestones it funded (one payout can cover many
  // donors, so disbursement entries aren't tied to a single donation).
  const disbursementIds = donation.allocations
    .flatMap((a) => a.milestone?.disbursements ?? [])
    .map((d) => d.id);
  const ledgerEntries = await prisma.ledgerEntry.findMany({
    where: {
      OR: [
        { donationId: donation.id },
        ...(disbursementIds.length ? [{ disbursementId: { in: disbursementIds } }] : []),
      ],
    },
    orderBy: { seq: "asc" },
    select: {
      seq: true,
      kind: true,
      amountPaise: true,
      entryHash: true,
      createdAt: true,
      allocationId: true,
      disbursementId: true,
    },
  });

  // Which anchors cover this donation's ledger entries (spec §5)?
  const seqs = ledgerEntries.map((e) => e.seq);
  const anchors = seqs.length
    ? await prisma.anchor.findMany({
        where: {
          fromSeq: { lte: seqs[seqs.length - 1] },
          toSeq: { gte: seqs[0] },
        },
        select: { fromSeq: true, toSeq: true, merkleRoot: true, network: true, txHash: true, status: true },
      })
    : [];

  return { donation: { ...donation, ledgerEntries }, anchors };
}
