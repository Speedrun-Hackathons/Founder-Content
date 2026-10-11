import type { Platform, Voice } from "@/lib/model";
import type { ImageSize, PlatformRule } from "./platforms";

export type VariantDraft = {
  angle: string;
  text: string;
  imagePrompts: string[];
};

export type VariantPair = { A: VariantDraft; B: VariantDraft };

export type TextRequest = {
  platform: Platform;
  rule: PlatformRule;
  brief: string;
  voice: Voice;
  company: { name: string; url: string };
  feedback: string | null;
};

export type ImageRequest = { prompt: string; size: ImageSize };

export interface AdsAI {
  writeVariants(request: TextRequest): Promise<VariantPair>;
  makeImage(request: ImageRequest): Promise<Uint8Array<ArrayBuffer>>;
}

const OPENAI = "https://api.openai.com/v1";
const IMAGE_QUALITIES = ["low", "medium", "high"] as const;

export function textModel(): string {
  return process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
}

export function imageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
}

export function imageQuality(): string {
  const quality = process.env.OPENAI_IMAGE_QUALITY || "low";
  if (!(IMAGE_QUALITIES as readonly string[]).includes(quality)) {
    throw new Error(`OPENAI_IMAGE_QUALITY "${quality}" is not one of: ${IMAGE_QUALITIES.join(", ")}.`);
  }
  return quality;
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  return key;
}

async function callOpenAI(path: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const key = apiKey();
  let response: Response;
  try {
    response = await fetch(`${OPENAI}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`OpenAI could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = (data?.error as { message?: string } | undefined)?.message;
    throw new Error(`OpenAI refused the request (${response.status}): ${message ?? response.statusText}`);
  }
  if (!data) throw new Error("OpenAI answered with a body that is not JSON.");
  return data;
}

const draftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["angle", "text", "imagePrompts"],
  properties: {
    angle: { type: "string", description: "A few words naming the angle this Variant takes." },
    text: { type: "string", description: "The Ad text, ready to post." },
    imagePrompts: {
      type: "array",
      items: { type: "string" },
      description: "One image prompt per image, in order.",
    },
  },
};

const pairSchema = {
  type: "object",
  additionalProperties: false,
  required: ["A", "B"],
  properties: { A: draftSchema, B: draftSchema },
};

function systemPrompt(): string {
  return [
    "You write social media Ads for a small company in two Variants, A and B, for an A/B test.",
    "A and B must take clearly different angles (for example: time saved vs. social proof), each named in a few words.",
    "Follow the Voice exactly: its tone, every rule, and never use a banned word, in any form.",
    "Stay within the Platform's character limit with room to spare. Do not invent facts, prices or quotes not in the Brief.",
    "Write one image prompt per image the Platform needs. Each prompt describes a clean, on-brand photo or illustration",
    "that fits the Variant's angle. For a Carousel, the prompts are consecutive slides that tell one story.",
    "Images must contain no words, letters, logos or watermarks.",
  ].join(" ");
}

function userPrompt(request: TextRequest): string {
  const { rule, voice, company } = request;
  const lines = [
    `Company: ${company.name} (${company.url})`,
    `Brief:\n${request.brief}`,
    `Voice tone: ${voice.tone}`,
    `Voice rules:\n${voice.rules.map((r) => `- ${r}`).join("\n") || "- none"}`,
    `Banned words: ${voice.bannedWords.join(", ") || "none"}`,
    `Platform: ${rule.name}. Character limit: ${rule.maxChars}. Platform tone: ${rule.tone}`,
    rule.mediaKind === "carousel"
      ? `Media: a Carousel of exactly ${rule.images} images, size ${rule.imageSize}.`
      : `Media: exactly ${rule.images} image, size ${rule.imageSize}.`,
  ];
  if (request.feedback) lines.push(`Your last answer was rejected: ${request.feedback} Fix this.`);
  return lines.join("\n\n");
}

function isDraft(value: unknown): value is VariantDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.angle === "string" &&
    typeof draft.text === "string" &&
    Array.isArray(draft.imagePrompts) &&
    draft.imagePrompts.every((p) => typeof p === "string")
  );
}

function parsePair(data: Record<string, unknown>): VariantPair {
  const choice = (data.choices as { message?: { content?: string | null; refusal?: string | null } }[] | undefined)?.[0];
  const message = choice?.message;
  if (message?.refusal) throw new Error(`OpenAI declined to write the Ad: ${message.refusal}`);
  if (!message?.content) throw new Error("OpenAI returned no Ad text.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    throw new Error("OpenAI returned Ad text that is not valid JSON.");
  }
  const pair = parsed as Record<string, unknown>;
  if (!isDraft(pair?.A) || !isDraft(pair?.B)) throw new Error("OpenAI returned Ad text in an unexpected shape.");
  return { A: pair.A, B: pair.B };
}

export const openAIAds: AdsAI = {
  async writeVariants(request) {
    const data = await callOpenAI(
      "/chat/completions",
      {
        model: textModel(),
        reasoning_effort: "low",
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: userPrompt(request) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "ad_variants", strict: true, schema: pairSchema } },
      },
      90_000,
    );
    return parsePair(data);
  },

  async makeImage(request) {
    const quality = imageQuality();
    const data = await callOpenAI(
      "/images/generations",
      { model: imageModel(), prompt: request.prompt, size: request.size, quality, n: 1 },
      180_000,
    );
    const b64 = (data.data as { b64_json?: string }[] | undefined)?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image data.");
    return new Uint8Array(Buffer.from(b64, "base64"));
  },
};

let current: AdsAI = openAIAds;

export function adsAI(): AdsAI {
  return current;
}

export function setAdsAI(ai: AdsAI): void {
  current = ai;
}

export function resetAdsAI(): void {
  current = openAIAds;
}
