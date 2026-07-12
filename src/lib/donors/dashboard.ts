import { prisma } from "@/lib/db";

/**
 * The donor dashboard (spec §7): every life this donor has touched.
 * MVP seed — totals, cause breakdown, and the "your cases" list with live
 * status. Aggregate analytics ("top X%") arrive in v2.
 */
export async function getDonorDashboard(donorId: string) {
  const donor = await prisma.user.findUnique({
    where: { id: donorId },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  if (!donor) return null;

  const donations = await prisma.donation.findMany({
    where: { donorId, status: { not: "INITIATED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      donationNumber: true,
      amountPaise: true,
      status: true,
      createdAt: true,
      optInUpdates: true,
      targetCase: {
        select: {
          caseNumber: true,
          title: true,
          status: true,
          goalPaise: true,
          raisedPaise: true,
          fulfilledAt: true,
          cause: { select: { name: true, slug: true } },
          beneficiary: { select: { publicName: true } },
          statusUpdates: {
            orderBy: { publishedAt: "desc" },
            take: 1,
            select: { kind: true, body: true, publishedAt: true },
          },
        },
      },
    },
  });

  const impacts = await prisma.impactRecord.findMany({
    where: { donation: { donorId } },
    orderBy: { createdAt: "desc" },
    select: {
      summary: true,
      createdAt: true,
      case: {
        select: {
          caseNumber: true,
          title: true,
          beneficiary: { select: { publicName: true } },
        },
      },
    },
  });

  const totalGivenPaise = donations.reduce((s, d) => s + d.amountPaise, 0n);
  const caseNumbers = new Set(
    donations.map((d) => d.targetCase?.caseNumber).filter((n) => n !== undefined),
  );
  const livesTouched = new Set(impacts.map((i) => i.case.caseNumber)).size;

  // Cause breakdown: how this donor's giving distributes across causes
  const byCause = new Map<string, { name: string; amountPaise: bigint }>();
  for (const d of donations) {
    if (!d.targetCase) continue;
    const key = d.targetCase.cause.slug;
    const existing = byCause.get(key);
    if (existing) existing.amountPaise += d.amountPaise;
    else byCause.set(key, { name: d.targetCase.cause.name, amountPaise: d.amountPaise });
  }
  const causeBreakdown = [...byCause.values()].sort((a, b) =>
    b.amountPaise > a.amountPaise ? 1 : b.amountPaise < a.amountPaise ? -1 : 0,
  );

  return {
    donor,
    donations,
    impacts,
    stats: {
      totalGivenPaise,
      casesSupported: caseNumbers.size,
      livesTouched,
      donationCount: donations.length,
    },
    causeBreakdown,
  };
}

/** Email lookup for the dashboard entry form. TODO(auth): replace with session. */
export async function findDonorByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}
