// Records real Social Streamline responses into tests/fixtures/social-streamline/live/ (gitignored) so the
// normalizers and the hand-written fixtures can be checked against the real shapes.
//
//   node scripts/record-social-streamline.ts            read-only: me, credits, accounts, posts, analytics
//   node scripts/record-social-streamline.ts --write    also a LinkedIn and an X caption (spends credits)
//                                                      and a draft that is created, read back and deleted
//
// Never schedules or publishes. Reads SOCIAL_STREAMLINE_API_KEY from the environment, .env.local or .env.
// The recordings hold real account handles and post text, so they stay out of git; copy a trimmed,
// edited version into tests/fixtures/social-streamline when a test needs a new shape.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const outDir = new URL("tests/fixtures/social-streamline/live/", root);

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) loadEnvFile(name);
}

function loadEnvFile(name: string) {
  const file = new URL(name, root);
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFiles();
const apiKey = process.env.SOCIAL_STREAMLINE_API_KEY;
const baseUrl = (process.env.SOCIAL_STREAMLINE_API_URL || "https://socialstreamline.me/api/v1").replace(/\/$/, "");
if (!apiKey) {
  console.error("Set SOCIAL_STREAMLINE_API_KEY in .env (Social Streamline > Settings > Developer).");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

async function record(name: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {}
  const headers: Record<string, string> = {};
  for (const h of ["retry-after", "x-request-id"]) {
    const v = response.headers.get(h);
    if (v) headers[h] = v;
  }
  const recording = { source: `recorded ${today} (${method} ${path})`, status: response.status, headers, body: parsed };
  writeFileSync(new URL(`live-${name}.json`, outDir), JSON.stringify(recording, null, 2) + "\n");
  console.log(`${String(response.status).padEnd(4)} ${method} ${path} -> live-${name}.json`);
  return parsed;
}

await record("me", "GET", "/me");
await record("credits", "GET", "/credits");
await record("accounts", "GET", "/accounts");
await record("posts", "GET", "/posts?limit=5");
await record("posts-failed", "GET", "/posts?status=failed&limit=3");
await record("analytics", "GET", "/analytics?days=30");

if (process.argv.includes("--write")) {
  await record("content-generate", "POST", "/content/generate", {
    transcript:
      "Founder Content is a site for solo founders and small teams. You paste your company URL, approve a short brief and a voice, and it writes posts for every platform, tests two versions of each ad, and schedules the winners through one posting service.",
    platforms: ["linkedin", "twitter"],
  });
  const created = (await record("posts-create", "POST", "/posts", {
    content: "Recording a draft shape. This draft is deleted right after.",
    platforms: ["linkedin"],
  })) as { id?: string } | undefined;
  const id = created?.id;
  if (id) {
    await record("posts-get", "GET", `/posts/${id}`);
    await record("posts-delete", "DELETE", `/posts/${id}`);
  } else {
    console.error("Could not find the new draft's id; delete it by hand in Social Streamline > Posts > Drafts.");
  }
}
