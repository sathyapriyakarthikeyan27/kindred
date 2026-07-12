import { verifyMilestoneSchema } from "@/lib/cases/schemas";
import { verifyMilestone } from "@/lib/cases/workflow";
import { errorResponse, jsonResponse } from "@/lib/api";

/** Milestone sign-off: PENDING → VERIFIED (tranche becomes release-eligible). */
export async function POST(request: Request, ctx: RouteContext<"/api/milestones/[id]/verify">) {
  try {
    const { id } = await ctx.params;
    const { partnerId, note } = verifyMilestoneSchema.parse(await request.json());
    return jsonResponse(await verifyMilestone(id, partnerId, note));
  } catch (e) {
    return errorResponse(e);
  }
}
