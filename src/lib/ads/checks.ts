import type { Voice } from "@/lib/model";
import type { PlatformRule } from "./platforms";
import type { VariantDraft, VariantPair } from "./ai";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function bannedWordIn(text: string, bannedWords: string[]): string | null {
  for (const word of bannedWords) {
    const trimmed = word.trim();
    if (!trimmed) continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}])`, "iu");
    if (pattern.test(text)) return trimmed;
  }
  return null;
}

function checkDraft(label: string, draft: VariantDraft, rule: PlatformRule, voice: Voice): string | null {
  const text = draft.text.trim();
  if (!text) return `Variant ${label} has no text.`;
  if (!draft.angle.trim()) return `Variant ${label} names no angle.`;
  const length = [...text].length;
  if (length > rule.maxChars) {
    return `Variant ${label} is ${length} characters; ${rule.name} allows ${rule.maxChars}.`;
  }
  const banned = bannedWordIn(text, voice.bannedWords);
  if (banned) return `Variant ${label} uses the banned word "${banned}".`;
  if (draft.imagePrompts.length !== rule.images) {
    return `Variant ${label} has ${draft.imagePrompts.length} image prompt(s); ${rule.name} needs ${rule.images}.`;
  }
  if (draft.imagePrompts.some((prompt) => !prompt.trim())) return `Variant ${label} has an empty image prompt.`;
  return null;
}

export function checkPair(pair: VariantPair, rule: PlatformRule, voice: Voice): string | null {
  const problem = checkDraft("A", pair.A, rule, voice) ?? checkDraft("B", pair.B, rule, voice);
  if (problem) return problem;
  if (pair.A.angle.trim().toLowerCase() === pair.B.angle.trim().toLowerCase()) {
    return "Variants A and B take the same angle.";
  }
  return null;
}
