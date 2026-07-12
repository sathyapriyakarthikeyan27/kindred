import { submitForVerification } from "@/lib/cases/workflow";
import { errorResponse, jsonResponse } from "@/lib/api";

/** DRAFT → PENDING_VERIFICATION (requires active beneficiary consent). */
export async function POST(_req: Request, ctx: RouteContext<"/api/cases/[id]/submit">) {
  try {
    const { id } = await ctx.params;
    return jsonResponse(await submitForVerification(id));
  } catch (e) {
    return errorResponse(e);
  }
}
