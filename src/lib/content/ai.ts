// Writes the Brief and the Voice from the Company page and the Documents, through OpenAI with a
// strict JSON schema. Same call style as src/lib/ads/ai.ts: fetch, no SDK, OPENAI_TEXT_MODEL.

import type { SitePage } from "./site";

export type BriefRequest = {
  url: string;
  page: SitePage;
  documents: { filename: string; text: string }[];
};

export type BriefDraft = {
  companyName: string;
  brief: string;
  voice: { tone: string; rules: string[]; bannedWords: string[] };
};

export interface BriefAI {
  writeBrief(request: BriefRequest): Promise<BriefDraft>;
}

export class OpenAINotConfigured extends Error {}

const OPENAI = "https://api.openai.com/v1";
const MAX_DOCUMENT_CHARS = 8_000;
const MAX_DOCUMENTS_CHARS = 30_000;

function textModel(): string {
  return process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
}

const briefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["companyName", "brief", "voice"],
  properties: {
    companyName: { type: "string", description: "The company's name as it presents itself." },
    brief: {
      type: "string",
      description: "120 to 220 words: what the product is, who it is for, the problem it solves, how it works, and any proof points.",
    },
    voice: {
      type: "object",
      additionalProperties: false,
      required: ["tone", "rules", "bannedWords"],
      properties: {
        tone: { type: "string", description: "Three to five adjectives, comma separated." },
        rules: { type: "array", items: { type: "string" }, description: "Three to six short wording rules." },
        bannedWords: { type: "array", items: { type: "string" }, description: "Words and phrases this company should never use." },
      },
    },
  },
};

function systemPrompt(): string {
  return [
    "You write the Brief and the Voice that every social post and Ad for a small company will follow.",
    "The Brief describes the product plainly, using only facts in the sources: never invent customers, numbers, prices or quotes.",
    "If the sources are thin, say less rather than guess.",
    "The Voice is how the company sounds in its own copy: a tone, a few concrete wording rules, and banned words.",
    "Banned words always include empty hype the sources do not use, such as 'revolutionary' or 'game-changing'.",
  ].join(" ");
}

export function userPrompt(request: BriefRequest): string {
  const { page } = request;
  const lines = [
    `Company URL: ${request.url}`,
    `Page title: ${page.title || "(none)"}`,
    `Page description: ${page.description || "(none)"}`,
    `Page text:\n${page.text || "(none)"}`,
  ];
  let budget = MAX_DOCUMENTS_CHARS;
  for (const doc of request.documents) {
    const text = doc.text.slice(0, Math.min(MAX_DOCUMENT_CHARS, budget));
    if (!text) break;
    budget -= text.length;
    lines.push(`Document "${doc.filename}":\n${text}`);
  }
  return lines.join("\n\n");
}

async function callOpenAI(body: unknown): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new OpenAINotConfigured("OPENAI_API_KEY is not set on the server.");
  let response: Response;
  try {
    response = await fetch(`${OPENAI}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
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

export function parseBrief(data: Record<string, unknown>): BriefDraft {
  const message = (data.choices as { message?: { content?: string | null; refusal?: string | null } }[] | undefined)?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI declined to write the Brief: ${message.refusal}`);
  if (!message?.content) throw new Error("OpenAI returned no Brief.");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    throw new Error("OpenAI returned a Brief that is not valid JSON.");
  }
  const voice = (parsed.voice ?? {}) as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : null);
  const rules = strings(voice.rules);
  const bannedWords = strings(voice.bannedWords);
  if (typeof parsed.companyName !== "string" || typeof parsed.brief !== "string" || typeof voice.tone !== "string" || !rules || !bannedWords) {
    throw new Error("OpenAI returned a Brief in an unexpected shape.");
  }
  return { companyName: parsed.companyName.trim(), brief: parsed.brief.trim(), voice: { tone: voice.tone.trim(), rules, bannedWords } };
}

export const openAIBrief: BriefAI = {
  async writeBrief(request) {
    const data = await callOpenAI({
      model: textModel(),
      reasoning_effort: "low",
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(request) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "brief_and_voice", strict: true, schema: briefSchema } },
    });
    return parseBrief(data);
  },
};

let current: BriefAI = openAIBrief;

export function briefAI(): BriefAI {
  return current;
}

export function setBriefAI(ai: BriefAI): void {
  current = ai;
}

export function resetBriefAI(): void {
  current = openAIBrief;
}
