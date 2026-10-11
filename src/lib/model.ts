export const PLATFORMS = [
  "x",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
  "pinterest",
  "bluesky",
  "threads",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

export type Founder = {
  id: string;
  email: string;
  name: string;
  companyId: string | null;
};

export type Company = {
  id: string;
  founderId: string;
  url: string;
  name: string;
  createdAt: string;
};

export type Document = {
  id: string;
  companyId: string;
  filename: string;
  text: string;
};

export type Brief = {
  id: string;
  companyId: string;
  text: string;
  approved: boolean;
  approvedAt: string | null;
};

export type Voice = {
  id: string;
  companyId: string;
  tone: string;
  rules: string[];
  bannedWords: string[];
};

export type Run = {
  id: string;
  briefId: string;
  platforms: Platform[];
  startedAt: string;
  publishedAt: string | null;
  runTimeSeconds: number | null;
};

export type VariantLabel = "A" | "B";

export type MediaKind = "text" | "image" | "carousel" | "video";

export type Variant = {
  id: string;
  runId: string;
  platform: Platform;
  label: VariantLabel;
  text: string;
  mediaKind: MediaKind;
  mediaUrls: string[];
};

export type Ad = {
  id: string;
  runId: string;
  platform: Platform;
  variants: [Variant, Variant];
  winnerVariantId: string | null;
};

export type Winner = {
  adId: string;
  variantId: string;
  pickedAt: string;
};

export type PostStatus = "draft" | "scheduled" | "published" | "failed";

export type Post = {
  id: string;
  runId: string;
  /** Empty for a caption draft (origin "caption"), which is written per Platform without A and B Variants. */
  variantId: string;
  platform: Platform;
  status: PostStatus;
  scheduledFor: string | null;
  providerPostId: string | null;
  error: string | null;
  /** Added by lane B: where the Post came from, and the text it sends. */
  origin: "variant" | "caption";
  text: string;
  /** Added by lane B: the public image or video URLs the Post carries. */
  mediaUrls: string[];
};

export type RunTime = {
  runId: string;
  seconds: number;
};

export type TimeSaved = {
  totalRuns: number;
  totalRunSeconds: number;
  surveyHoursPerWeekLow: number;
  surveyHoursPerWeekHigh: number;
  surveySource: string;
};

export type Account = {
  id: string;
  platform: Platform;
  handle: string;
  connected: boolean;
};

export type AnalyticsRow = {
  platform: Platform;
  posts: number;
  impressions: number;
  engagements: number;
  standIn: boolean;
};

export const EVENT_TYPES = [
  "brief_approved",
  "run_started",
  "variant_generated",
  "winner_picked",
  "post_published",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

export const SURVEY_SOURCE =
  "Markel Direct survey of 501 UK small business owners, 2026: 54% spend 1 to 3 hours a week creating social content";
