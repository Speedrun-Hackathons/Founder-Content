// Server-side entry point to the posting service for the API routes. The key stays in the server
// environment; the browser only ever calls the site's own routes.

import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import type { Post, PostStatus } from "@/lib/model";
import { markRunPublished, recordEvent } from "@/lib/store";
import { createSocialStreamline, SocialStreamlineError, type ProviderPost, type SocialStreamline } from "./client";

export { SocialStreamlineError } from "./client";
export type { Caption, ProviderAccount, ProviderPost, SocialStreamline } from "./client";

let testClient: SocialStreamline | null = null;

/** Tests install a fake here. */
export function setSocialStreamline(client: SocialStreamline): void {
  testClient = client;
}

/** Goes back to the client built from the environment. */
export function resetSocialStreamline(): void {
  testClient = null;
}

export function socialStreamline(): SocialStreamline {
  if (testClient) return testClient;
  const apiKey = process.env.SOCIAL_STREAMLINE_API_KEY;
  if (!apiKey) {
    throw new SocialStreamlineError(503, "posting_service_not_configured", "SOCIAL_STREAMLINE_API_KEY is not set on the server.", null);
  }
  return createSocialStreamline({ apiKey, baseUrl: process.env.SOCIAL_STREAMLINE_API_URL || undefined });
}

/**
 * Answers a failed posting-service call. The service's own reason text goes through unchanged:
 * a refusal is 422, a rate limit is 429 with Retry-After, and a problem on our side of the
 * connection (no key, a rejected key, the service down) is 502 or 503.
 */
export function serviceFailure(err: unknown): NextResponse {
  if (!(err instanceof SocialStreamlineError)) {
    const reason = err instanceof Error ? err.message : String(err);
    return fail("posting_service_unreachable", `Social Streamline could not be reached: ${reason}`, 502);
  }
  if (err.code === "posting_service_not_configured") return fail(err.code, err.message, 503);
  if (err.status === 429) {
    const res = fail(err.code, err.message, 429);
    if (err.retryAfterSeconds) res.headers.set("Retry-After", String(err.retryAfterSeconds));
    return res;
  }
  if (err.status === 401 || err.status === 403 || err.status >= 500) return fail(err.code, err.message, 502);
  return fail(err.code, err.message, 422);
}

/** Copies the provider's view of a post onto the site's Post. Returns the new status. */
export function applyProviderPost(post: Post, provider: ProviderPost): PostStatus {
  const outcome = provider.platforms.find((o) => o.platform === post.platform);
  const failed = provider.status === "failed" || outcome?.status === "failed";
  const held = !failed && toPostStatus(provider.status) === null;
  post.providerPostId = provider.id;
  post.scheduledFor = provider.scheduledFor;
  post.status = failed || held ? "failed" : (toPostStatus(provider.status) as PostStatus);
  post.error = failed
    ? (provider.errorMessage ?? ([outcome?.error, outcome?.nextStep].filter(Boolean).join(" ") || "The platform refused this post."))
    : held
      ? `The posting service holds this post with status "${provider.status}"; open it there to continue.`
      : null;
  return post.status;
}

function toPostStatus(status: string): PostStatus | null {
  if (status === "draft" || status === "scheduled" || status === "published") return status;
  if (status === "processing") return "scheduled";
  return null;
}

export function isSending(post: Post): boolean {
  return post.providerPostId !== null && post.status === "scheduled";
}

/** Stamps the Run time and sends post_published once, when a Post first reaches published. */
export async function recordIfPublished(post: Post, before: PostStatus): Promise<void> {
  if (post.status !== "published" || before === "published") return;
  markRunPublished(post.runId);
  recordEvent("post_published", { postId: post.id, platform: post.platform });
}
