import { returnToDraftSchema } from "@/lib/cases/schemas";
import { returnCaseToDraft } from "@/lib/cases/workflow";
import { errorResponse, jsonResponse } from "@/lib/api";

/** Partner sends a pending case back for fixes: PENDING_VERIFICATION → DRAFT. */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/return">) {
  try {
    const { id } = await ctx.params;
    const { reason } = returnToDraftSchema.parse(await request.json());
    return jsonResponse(await returnCaseToDraft(id, reason));
  } catch (e) {
    return errorResponse(e);
  }
}
