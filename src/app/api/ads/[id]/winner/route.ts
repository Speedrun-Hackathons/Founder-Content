import { fail, isResponse, json, readJson } from "@/lib/http";
import type { Ad } from "@/lib/model";
import { getState, pickWinner, recordEvent } from "@/lib/store";

function lockedPost(ad: Ad) {
  const variantIds = ad.variants.map((v) => v.id);
  return (
    getState().posts.find(
      (p) => variantIds.includes(p.variantId) && (p.status === "scheduled" || p.status === "published"),
    ) ?? null
  );
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const variantId = typeof body.variantId === "string" ? body.variantId : "";
  if (!variantId) return fail("no_variant", "variantId is required.", 422);
  const ad = getState().ads.find((a) => a.id === id);
  if (!ad) return fail("no_ad", `No Ad ${id}.`, 404);
  if (!ad.variants.some((v) => v.id === variantId)) return fail("no_variant", `Ad ${id} has no Variant ${variantId}.`, 422);
  const locked = lockedPost(ad);
  if (locked) {
    return fail(
      "winner_locked",
      `The Winner of Ad ${id} is locked: Post ${locked.id} is already ${locked.status}.`,
      409,
    );
  }
  const result = pickWinner(id, variantId);
  if (result === "no_ad") return fail("no_ad", `No Ad ${id}.`, 404);
  if (result === "no_variant") return fail("no_variant", `Ad ${id} has no Variant ${variantId}.`, 422);
  recordEvent("winner_picked", { adId: id, variantId });
  return json({ ad: result });
}
