/** Validates a preset body: a name of 1 to 120 characters and a settings object. */
export function readPresetBody(
  body: Record<string, unknown>,
  creating: boolean,
): { name?: string; settings?: Record<string, unknown> } | { error: string } {
  const out: { name?: string; settings?: Record<string, unknown> } = {};
  if (body.name !== undefined || creating) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) return { error: "A preset needs a name of 1 to 120 characters." };
    out.name = name;
  }
  if (body.settings !== undefined) {
    if (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) {
      return { error: "settings must be a JSON object." };
    }
    out.settings = body.settings as Record<string, unknown>;
  }
  return out;
}

/** The events a webhook can subscribe to; "*" includes ones the service adds later. */
export const WEBHOOK_EVENTS = ["*", "post.published", "post.failed", "render.completed", "render.failed", "account.connected"];
