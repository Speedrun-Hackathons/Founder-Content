// Keeps personal data and secrets out of event data before it leaves the site.
// A value that looks like an email, a phone number or a key is dropped, and so is any
// field whose name says it holds one.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{5,}\d/g;
const KEY_PREFIX = /\b(sk|pk|rk|ak)[-_][A-Za-z0-9_-]{12,}/;
const BEARER = /\bbearer\s+[A-Za-z0-9._~+/-]{12,}/i;
const LONG_TOKEN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g;
const SENSITIVE_NAME = /(api[_-]?key|token|secret|password|passwd|authorization|e-?mail|phone|mobile)/i;

function looksLikePhone(text: string): boolean {
  for (const match of text.match(PHONE_CANDIDATE) ?? []) {
    const digits = match.replace(/\D/g, "").length;
    const plus = match.startsWith("+");
    if (digits >= 10 || (plus && digits >= 7)) return true;
  }
  return false;
}

function looksLikeKey(text: string): boolean {
  if (KEY_PREFIX.test(text) || BEARER.test(text)) return true;
  return (text.match(LONG_TOKEN) ?? []).some((token) => /\d/.test(token) && /[A-Za-z]/.test(token));
}

export function isSensitiveText(text: string): boolean {
  return EMAIL.test(text) || looksLikePhone(text) || looksLikeKey(text);
}

function clean(value: unknown, depth: number): { keep: boolean; value?: unknown } {
  if (typeof value === "string") return isSensitiveText(value) ? { keep: false } : { keep: true, value };
  if (value === null || typeof value === "number" || typeof value === "boolean") return { keep: true, value };
  if (depth > 4) return { keep: false };
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const result = clean(item, depth + 1);
      if (result.keep) items.push(result.value);
    }
    return { keep: true, value: items };
  }
  if (typeof value === "object") {
    return { keep: true, value: sanitizeEventData(value as Record<string, unknown>, depth + 1) };
  }
  return { keep: false };
}

export function sanitizeEventData(data: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(data)) {
    if (SENSITIVE_NAME.test(name)) continue;
    const result = clean(value, depth);
    if (result.keep) out[name] = result.value;
  }
  return out;
}
