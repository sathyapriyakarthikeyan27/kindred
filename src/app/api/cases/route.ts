import { caseIntakeSchema } from "@/lib/cases/schemas";
import { intakeCase } from "@/lib/cases/workflow";
import { errorResponse, jsonResponse } from "@/lib/api";
import { prisma } from "@/lib/db";

/** Beneficiary intake: beneficiary + consent + DRAFT case + milestones. */
export async function POST(request: Request) {
  try {
    const input = caseIntakeSchema.parse(await request.json());
    const kase = await intakeCase(input);
    return jsonResponse(kase, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Public case list — only verified (ACTIVE and beyond) cases, masked names. */
export async function GET() {
  try {
    const cases = await prisma.case.findMany({
      where: { status: { in: ["ACTIVE", "FUNDED", "FULFILLED"] } },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        story: true,
        city: true,
        type: true,
        status: true,
        goalPaise: true,
        raisedPaise: true,
        leftoverPolicy: true,
        publishedAt: true,
        cause: { select: { slug: true, name: true } },
        beneficiary: { select: { publicName: true } }, // never fullName here
        milestones: {
          orderBy: { ord: "asc" },
          select: { ord: true, title: true, amountPaise: true, status: true },
        },
      },
      orderBy: { publishedAt: "desc" },
    });
    return jsonResponse(cases);
  } catch (e) {
    return errorResponse(e);
  }
}
