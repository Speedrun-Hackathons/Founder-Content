import type { Ad, Platform, Run, Variant, VariantLabel, Voice } from "@/lib/model";
import { newId } from "@/lib/store";
import { adsAI, type VariantDraft, type VariantPair } from "./ai";
import { checkPair } from "./checks";
import { imageStore } from "./media";
import { PLATFORM_RULES, videoOnlyReason, type ImageSize, type PlatformRule } from "./platforms";

export type AdVariant = Variant & { angle: string };

export type AdFailure = { runId: string; platform: Platform; error: string };

export type GenerateInput = {
  run: Run;
  brief: string;
  voice: Voice;
  company: { name: string; url: string };
  baseUrl: string;
};

const IMAGE_CONCURRENCY = 4;

let activeImages = 0;
const waiting: (() => void)[] = [];

async function withImageSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeImages < IMAGE_CONCURRENCY) activeImages += 1;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activeImages -= 1;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function writeChecked(input: GenerateInput, platform: Platform, rule: PlatformRule): Promise<VariantPair> {
  let feedback: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pair = await adsAI().writeVariants({
      platform,
      rule,
      brief: input.brief,
      voice: input.voice,
      company: input.company,
      feedback,
    });
    feedback = checkPair(pair, rule, input.voice);
    if (!feedback) return pair;
  }
  throw new Error(`The Ad text failed its checks twice. ${feedback}`);
}

async function makeImages(draft: VariantDraft, size: ImageSize, baseUrl: string): Promise<string[]> {
  return Promise.all(
    draft.imagePrompts.map(async (prompt) => {
      const bytes = await withImageSlot(() => adsAI().makeImage({ prompt, size }));
      return imageStore().save(bytes, baseUrl);
    }),
  );
}

function variant(run: Run, platform: Platform, rule: PlatformRule, label: VariantLabel, draft: VariantDraft, mediaUrls: string[]): AdVariant {
  return {
    id: newId("var"),
    runId: run.id,
    platform,
    label,
    angle: draft.angle.trim(),
    text: draft.text.trim(),
    mediaKind: rule.mediaKind,
    mediaUrls,
  };
}

async function generatePlatform(input: GenerateInput, platform: Platform): Promise<Ad | AdFailure> {
  const { run } = input;
  const rule = PLATFORM_RULES[platform];
  if (rule.mediaKind === "video" || !rule.imageSize) return { runId: run.id, platform, error: videoOnlyReason(rule) };
  const size = rule.imageSize;
  try {
    const pair = await writeChecked(input, platform, rule);
    const [imagesA, imagesB] = await Promise.all([
      makeImages(pair.A, size, input.baseUrl),
      makeImages(pair.B, size, input.baseUrl),
    ]);
    return {
      id: newId("ad"),
      runId: run.id,
      platform,
      variants: [
        variant(run, platform, rule, "A", pair.A, imagesA),
        variant(run, platform, rule, "B", pair.B, imagesB),
      ],
      winnerVariantId: null,
    };
  } catch (error) {
    return { runId: run.id, platform, error: message(error) };
  }
}

export async function generateAds(input: GenerateInput): Promise<{ ads: Ad[]; failures: AdFailure[] }> {
  const results = await Promise.all(input.run.platforms.map((platform) => generatePlatform(input, platform)));
  const ads: Ad[] = [];
  const failures: AdFailure[] = [];
  for (const result of results) {
    if ("error" in result) failures.push(result);
    else ads.push(result);
  }
  return { ads, failures };
}

const failuresByRun = new Map<string, AdFailure[]>();

export function saveFailures(runId: string, failures: AdFailure[]): void {
  failuresByRun.set(runId, failures);
}

export function failuresFor(runIds: string[]): AdFailure[] {
  return runIds.flatMap((id) => failuresByRun.get(id) ?? []);
}

export function resetFailures(): void {
  failuresByRun.clear();
}
