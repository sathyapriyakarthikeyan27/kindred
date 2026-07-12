import { allocateSchema } from "@/lib/donations/schemas";
import { allocateDonation } from "@/lib/donations/service";
import { errorResponse, jsonResponse } from "@/lib/api";

/** Admin: earmark held funds to a milestone tranche (allocation engine in v2). */
export async function POST(request: Request) {
  try {
    const input = allocateSchema.parse(await request.json());
    return jsonResponse(await allocateDonation(input), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
