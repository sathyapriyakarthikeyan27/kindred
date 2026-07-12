import { verifyQuery } from "@/lib/anchoring/query";
import { errorResponse, jsonResponse } from "@/lib/api";

/** Public: verify a donation (D-5), ledger seq, or entry hash. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get("q");
    if (!q) return Response.json({ error: "Missing ?q=" }, { status: 400 });
    const result = await verifyQuery(q);
    return jsonResponse(result, { status: result.type === "not_found" ? 404 : 200 });
  } catch (e) {
    return errorResponse(e);
  }
}
