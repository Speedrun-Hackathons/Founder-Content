import {
  type Account,
  type Ad,
  type AnalyticsRow,
  type Brief,
  type Company,
  type Document,
  type Platform,
  type Post,
  type Run,
  type TimeSaved,
  type Variant,
  type Voice,
  SURVEY_SOURCE,
} from "./model";

type State = {
  company: Company | null;
  documents: Document[];
  brief: Brief | null;
  voice: Voice | null;
  runs: Run[];
  ads: Ad[];
  posts: Post[];
  accounts: Account[];
  events: { type: string; data: Record<string, unknown>; at: string }[];
};

const FOUNDER_ID = "founder_demo";

let counter = 0;

export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36).padStart(4, "0")}`;
}

export function now(): string {
  return new Date().toISOString();
}

function seedAccounts(): Account[] {
  const connected: Platform[] = ["instagram", "facebook", "tiktok", "linkedin", "x", "threads", "bluesky", "pinterest", "youtube"];
  return connected.map((platform) => ({
    id: newId("acct"),
    platform,
    handle: `@demo_${platform}`,
    connected: true,
  }));
}

function freshState(): State {
  return {
    company: null,
    documents: [],
    brief: null,
    voice: null,
    runs: [],
    ads: [],
    posts: [],
    accounts: seedAccounts(),
    events: [],
  };
}

let state: State = freshState();

export function resetStore(): void {
  counter = 0;
  state = freshState();
}

export function getState(): State {
  return state;
}

export function founderId(): string {
  return FOUNDER_ID;
}

export function createCompany(url: string, documents: { filename: string; text: string }[]): {
  company: Company;
  brief: Brief;
  voice: Voice;
} {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const company: Company = {
    id: newId("co"),
    founderId: FOUNDER_ID,
    url,
    name: host.split(".")[0],
    createdAt: now(),
  };
  const docs: Document[] = documents.map((d) => ({
    id: newId("doc"),
    companyId: company.id,
    filename: d.filename,
    text: d.text,
  }));
  const brief: Brief = {
    id: newId("brief"),
    companyId: company.id,
    text: `${company.name} helps its customers with the product described at ${url}. ${docs.length} document(s) attached.`,
    approved: false,
    approvedAt: null,
  };
  const voice: Voice = {
    id: newId("voice"),
    companyId: company.id,
    tone: "plain, direct, confident",
    rules: ["Short sentences.", "One idea per post.", "End with a concrete action."],
    bannedWords: ["revolutionary", "seamless", "game-changing"],
  };
  state.company = company;
  state.documents = docs;
  state.brief = brief;
  state.voice = voice;
  return { company, brief, voice };
}

export function updateBrief(patch: { text?: string; approved?: boolean }): Brief | null {
  if (!state.brief) return null;
  if (typeof patch.text === "string") state.brief.text = patch.text;
  if (typeof patch.approved === "boolean") {
    state.brief.approved = patch.approved;
    state.brief.approvedAt = patch.approved ? now() : null;
  }
  return state.brief;
}

export function updateVoice(patch: { tone?: string; rules?: string[]; bannedWords?: string[] }): Voice | null {
  if (!state.voice) return null;
  if (typeof patch.tone === "string") state.voice.tone = patch.tone;
  if (Array.isArray(patch.rules)) state.voice.rules = patch.rules;
  if (Array.isArray(patch.bannedWords)) state.voice.bannedWords = patch.bannedWords;
  return state.voice;
}

function fakeVariant(run: Run, platform: Platform, label: "A" | "B"): Variant {
  const name = state.company?.name ?? "the company";
  const kind = platform === "tiktok" || platform === "youtube" ? "video" : platform === "instagram" || platform === "linkedin" ? "carousel" : "image";
  return {
    id: newId("var"),
    runId: run.id,
    platform,
    label,
    text:
      label === "A"
        ? `${name} gives founders their week back. See how in 60 seconds.`
        : `Stop writing posts by hand. ${name} drafts, tests and schedules them for you.`,
    mediaKind: kind,
    mediaUrls: [`https://example.invalid/media/${run.id}/${platform}/${label}.png`],
  };
}

export function createRun(platforms: Platform[]): { run: Run; ads: Ad[] } {
  const run: Run = {
    id: newId("run"),
    briefId: state.brief!.id,
    platforms,
    startedAt: now(),
    publishedAt: null,
    runTimeSeconds: null,
  };
  const ads: Ad[] = platforms.map((platform) => ({
    id: newId("ad"),
    runId: run.id,
    platform,
    variants: [fakeVariant(run, platform, "A"), fakeVariant(run, platform, "B")],
    winnerVariantId: null,
  }));
  state.runs.push(run);
  state.ads.push(...ads);
  return { run, ads };
}

export function pickWinner(adId: string, variantId: string): Ad | "no_ad" | "no_variant" {
  const ad = state.ads.find((a) => a.id === adId);
  if (!ad) return "no_ad";
  if (!ad.variants.some((v) => v.id === variantId)) return "no_variant";
  ad.winnerVariantId = variantId;
  return ad;
}

export function findVariant(variantId: string): { ad: Ad; variant: Variant } | null {
  for (const ad of state.ads) {
    const variant = ad.variants.find((v) => v.id === variantId);
    if (variant) return { ad, variant };
  }
  return null;
}

export function createDraft(variantId: string): Post | null {
  const found = findVariant(variantId);
  if (!found) return null;
  const post: Post = {
    id: newId("post"),
    runId: found.ad.runId,
    variantId,
    platform: found.variant.platform,
    origin: "variant",
    text: found.variant.text,
    status: "draft",
    scheduledFor: null,
    providerPostId: null,
    error: null,
  };
  state.posts.push(post);
  return post;
}

export function findPost(postId: string): Post | null {
  return state.posts.find((p) => p.id === postId) ?? null;
}

export function markRunPublished(runId: string): void {
  const run = state.runs.find((r) => r.id === runId);
  if (!run || run.publishedAt) return;
  run.publishedAt = now();
  run.runTimeSeconds = Math.max(1, Math.round((Date.parse(run.publishedAt) - Date.parse(run.startedAt)) / 1000));
}

export function timeSaved(): TimeSaved {
  const finished = state.runs.filter((r) => r.runTimeSeconds !== null);
  return {
    totalRuns: finished.length,
    totalRunSeconds: finished.reduce((sum, r) => sum + (r.runTimeSeconds ?? 0), 0),
    surveyHoursPerWeekLow: 1,
    surveyHoursPerWeekHigh: 3,
    surveySource: SURVEY_SOURCE,
  };
}

export function postAnalytics(): AnalyticsRow[] {
  const byPlatform = new Map<Platform, AnalyticsRow>();
  for (const post of state.posts.filter((p) => p.status === "published")) {
    const row = byPlatform.get(post.platform) ?? {
      platform: post.platform,
      posts: 0,
      impressions: 0,
      engagements: 0,
      standIn: true,
    };
    row.posts += 1;
    row.impressions += 1200;
    row.engagements += 48;
    byPlatform.set(post.platform, row);
  }
  return [...byPlatform.values()];
}

export function adAnalytics(): AnalyticsRow[] {
  return state.ads.map((ad) => ({
    platform: ad.platform,
    posts: 2,
    impressions: 800,
    engagements: ad.winnerVariantId ? 40 : 20,
    standIn: true,
  }));
}

export function recordEvent(type: string, data: Record<string, unknown>): void {
  state.events.push({ type, data, at: now() });
}
