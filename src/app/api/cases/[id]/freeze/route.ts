import { freezeCaseSchema } from "@/lib/cases/schemas";
import { freezeCase } from "@/lib/cases/workflow";
import { errorResponse, jsonResponse } from "@/lib/api";

/** Trust & Safety: flag pauses everything → FROZEN (spec §10). */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/freeze">) {
  try {
    const { id } = await ctx.params;
    const { reason } = freezeCaseSchema.parse(await request.json());
    return jsonResponse(await freezeCase(id, reason));
  } catch (e) {
    return errorResponse(e);
  }
}
