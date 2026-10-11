import { fail, isResponse, json, readJson } from "@/lib/http";
import { pickWinner, recordEvent } from "@/lib/store";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const variantId = typeof body.variantId === "string" ? body.variantId : "";
  if (!variantId) return fail("no_variant", "variantId is required.", 422);
  const result = pickWinner(id, variantId);
  if (result === "no_ad") return fail("no_ad", `No Ad ${id}.`, 404);
  if (result === "no_variant") return fail("no_variant", `Ad ${id} has no Variant ${variantId}.`, 422);
  recordEvent("winner_picked", { adId: id, variantId });
  return json({ ad: result });
}
