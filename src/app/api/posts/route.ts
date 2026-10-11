import { fail, isResponse, json, readJson } from "@/lib/http";
import { createDraft, getState } from "@/lib/store";

export function GET() {
  return json({ posts: getState().posts });
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const variantId = typeof body.variantId === "string" ? body.variantId : "";
  if (!variantId) return fail("no_variant", "variantId is required.", 422);
  const post = createDraft(variantId);
  if (!post) return fail("no_variant", `No Variant ${variantId}.`, 404);
  return json({ post }, 201);
}
