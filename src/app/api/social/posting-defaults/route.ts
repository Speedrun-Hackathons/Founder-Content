import { fail, isResponse, readJson } from "@/lib/http";
import { respond } from "@/lib/social";

/** The flows the posting service remembers defaults for (recorded 2026-10-11). */
const KEYS = ["short", "long", "image", "quickpost", "crop"];

export async function GET() {
  return respond(async (ss) => ({ keys: KEYS, defaults: await ss.postingDefaults() }));
}

/** Replaces the stored defaults for one flow: { key, value }. */
export async function PUT(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const key = typeof body.key === "string" ? body.key : "";
  if (!KEYS.includes(key)) return fail("bad_key", `key must be one of ${KEYS.join(", ")}; got "${key}".`, 422);
  const value = body.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("bad_value", "value must be a JSON object.", 422);
  if (JSON.stringify(value).length > 32_000) return fail("bad_value", "value is larger than 32 KB.", 422);
  return respond(async (ss) => {
    await ss.setPostingDefault(key, value as Record<string, unknown>);
    return { key, value };
  });
}
