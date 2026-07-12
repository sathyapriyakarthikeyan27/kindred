import { verifyCaseSchema } from "@/lib/cases/schemas";
import { verifyCase } from "@/lib/cases/workflow";
import { errorResponse, jsonResponse } from "@/lib/api";

/** Partner sign-off: PENDING_VERIFICATION → ACTIVE (case goes public). */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/verify">) {
  try {
    const { id } = await ctx.params;
    const { partnerId } = verifyCaseSchema.parse(await request.json());
    return jsonResponse(await verifyCase(id, partnerId));
  } catch (e) {
    return errorResponse(e);
  }
}
