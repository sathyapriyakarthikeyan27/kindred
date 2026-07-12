import { z } from "zod";
import { postStatusUpdate } from "@/lib/cases/updates";
import { errorResponse, jsonResponse } from "@/lib/api";

const postUpdateSchema = z.object({
  partnerId: z.string().min(1), // TODO(auth): from session
  body: z.string().min(10),
  kind: z.enum(["PROGRESS", "CLOSURE"]).optional(),
});

/** Verified partner posts a field update donors will see. */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/updates">) {
  try {
    const { id } = await ctx.params;
    const input = postUpdateSchema.parse(await request.json());
    return jsonResponse(await postStatusUpdate({ caseId: id, ...input }), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
