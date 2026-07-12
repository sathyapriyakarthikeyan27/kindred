import { disburseSchema } from "@/lib/donations/schemas";
import { recordDisbursement } from "@/lib/donations/service";
import { errorResponse, jsonResponse } from "@/lib/api";

/** Admin: release a verified tranche direct-to-provider, proof required. */
export async function POST(request: Request) {
  try {
    const input = disburseSchema.parse(await request.json());
    return jsonResponse(await recordDisbursement(input), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
