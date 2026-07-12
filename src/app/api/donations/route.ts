import { recordDonationSchema } from "@/lib/donations/schemas";
import { recordDonation } from "@/lib/donations/service";
import { errorResponse, jsonResponse } from "@/lib/api";

/** Donor gives to a verified case; escrow receipt hits the ledger. */
export async function POST(request: Request) {
  try {
    const input = recordDonationSchema.parse(await request.json());
    const donation = await recordDonation(input);
    return jsonResponse(donation, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
