import { fail, isResponse, json, readJson } from "@/lib/http";
import { applyProviderPost, isSending, recordIfPublished, serviceFailure, socialStreamline } from "@/lib/social";
import { createDraft, findVariant, getState } from "@/lib/store";

export async function GET() {
  const posts = getState().posts;
  // Posts on their way out are re-read so a publish that finished later shows its final status.
  const sending = posts.filter(isSending);
  if (sending.length > 0) {
    try {
      const client = socialStreamline();
      await Promise.all(
        sending.map(async (post) => {
          try {
            const before = post.status;
            applyProviderPost(post, await client.getPost(post.providerPostId!));
            await recordIfPublished(post, before);
          } catch {
            // Keep the last known status; the next load tries again.
          }
        }),
      );
    } catch (err) {
      return serviceFailure(err);
    }
  }
  return json({ posts });
}

/** A draft from one Variant, created in the posting service. Nothing is sent yet. */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const variantId = typeof body.variantId === "string" ? body.variantId : "";
  if (!variantId) return fail("no_variant", "variantId is required.", 422);
  const found = findVariant(variantId);
  if (!found) return fail("no_variant", `No Variant ${variantId}.`, 404);

  const existing = getState().posts.find((p) => p.variantId === variantId && p.providerPostId);
  if (existing) return json({ post: existing });

  const { variant } = found;
  let provider;
  try {
    provider = await socialStreamline().createDraft(
      { content: variant.text, platforms: [variant.platform], mediaUrls: variant.mediaUrls },
      `draft:${variantId}`,
    );
  } catch (err) {
    return serviceFailure(err);
  }
  const post = createDraft(variantId)!;
  applyProviderPost(post, provider);
  return json({ post }, 201);
}
