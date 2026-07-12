import { fulfillCaseSchema } from "@/lib/cases/schemas";
import { fulfillCase } from "@/lib/cases/workflow";
import { errorResponse, jsonResponse } from "@/lib/api";

/** The closing moment (spec §6): → FULFILLED, CLOSING update, impact records. */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/fulfill">) {
  try {
    const { id } = await ctx.params;
    const { partnerId, closingMessage } = fulfillCaseSchema.parse(await request.json());
    return jsonResponse(await fulfillCase(id, partnerId, closingMessage));
  } catch (e) {
    return errorResponse(e);
  }
}
