import { isPlatform, type Platform } from "@/lib/model";

/** The ids Social Streamline uses; only X differs from the site's own. */
export type ApiPlatform = Exclude<Platform, "x"> | "twitter";

export function toApiPlatform(platform: Platform): ApiPlatform {
  return platform === "x" ? "twitter" : platform;
}

/** Reads a platform id from the service: "twitter" is X, and accounts name their TikTok API ("tiktok_business"). */
export function fromApiPlatform(value: unknown): Platform | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  if (lower === "twitter") return "x";
  if (lower.startsWith("tiktok")) return "tiktok";
  return isPlatform(lower) ? lower : null;
}
