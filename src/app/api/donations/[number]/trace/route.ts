import { getDonationTrace } from "@/lib/donations/service";
import { errorResponse, jsonResponse } from "@/lib/api";

/** The donor-facing trail: donation → allocation → disbursement → proof → anchors. */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/donations/[number]/trace">,
) {
  try {
    const { number } = await ctx.params;
    const donationNumber = Number(number.replace(/^D-/i, ""));
    if (!Number.isInteger(donationNumber) || donationNumber <= 0) {
      return Response.json({ error: "Invalid donation number" }, { status: 400 });
    }
    const trace = await getDonationTrace(donationNumber);
    if (!trace) return Response.json({ error: "Donation not found" }, { status: 404 });
    return jsonResponse(trace);
  } catch (e) {
    return errorResponse(e);
  }
}
