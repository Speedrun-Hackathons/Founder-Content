# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install --legacy-peer-deps   # the flag is required
npm run dev                      # http://localhost:3000; panel pages need DEMO_EMAIL and DEMO_PASSWORD in .env
npm test                         # vitest, all route tests, no network
npx vitest run tests/runs.test.ts            # one file
npx vitest run tests/ads.test.ts -t "Winner" # one test by name
npm run typecheck
npm run lint
npm run build
```

A ticket counts as done when `npm test`, `npm run lint` and `npm run build` are all clean. Node 24 is pinned in `.node-version`. Railway deploys from `railway.json`, with the health check on `/api/health`.

## Docs to read first

- `CONTEXT.md` is the glossary.
- `docs/SPEC.md` is the product spec.
- `docs/adr/` holds the decisions.
- `docs/HANDOFF-LANE-B.md` and `docs/HANDOFF-LANE-C.md` give each lane's tickets, owned paths and service protocols.
- `README.md` has the env var table and the route table.

## Architecture

- **Next.js App Router, one deploy.** Every external call (OpenAI, Social Streamline) runs in a route under `src/app/api/`. Pages under `src/app/(panel)/` are client components that call only the site's own routes, through `api()` in `src/lib/client.ts`.
- **Shared contract:**
  - `src/lib/model.ts` holds the types and the nine `PLATFORMS`.
  - `src/lib/store.ts` is an in-process store, seeded with stand-in data and reset on every restart. It serves every user and has no database.
  - Each lane replaces its part of the store with a live service and keeps the response shapes in `model.ts` fixed. Fields may be added; existing ones are not changed.
- **Shared files change only through the integrator:** `model.ts`, `store.ts`, `README.md`, `package.json`, `.env.example`.
- **Lane ownership:** don't edit another lane's paths. The handoff docs list the owned paths in full.
  - Lane A (shell): auth and hosting.
  - Lane B (content and posting): `src/lib/content`, `src/lib/social`, and the company, brief, posts and accounts routes.
  - Lane C (Ads and analytics): `src/lib/ads`, `src/lib/analytics`, and the runs, ads, analytics and events routes.
- **Route conventions:** reply with `json()` or `fail(code, message, status)` from `src/lib/http.ts`. Errors are `{ error, message }` with a 4xx status that names the bad value. Never answer with a 500, and never fall back to a silent default when a service fails; return the service's own reason.
- **External services sit behind small swappable interfaces.** Each has a module-level getter and setter, and tests install fakes through the setter:
  - OpenAI: `setAdsAI` in `src/lib/ads/ai.ts`.
  - Image storage: `setImageStore` in `src/lib/ads/media.ts`.
  - Posting-service analytics: `setPostAnalyticsSource` in `src/lib/analytics/posting-service.ts`.
- **OpenAI is called with `fetch`, not the SDK.**
  - Ad text comes from Chat Completions with a strict JSON schema. The model is `OPENAI_TEXT_MODEL`, default `gpt-5-mini`.
  - Images come from `/images/generations` as base64. The model is `OPENAI_IMAGE_MODEL`, default `gpt-image-2`.
  - `OPENAI_IMAGE_QUALITY` defaults to `low`. Keep it there until the demo; the team's budget is small.
- **Ad generation** (`src/lib/ads/generate.ts`):
  - Platforms run in parallel, with at most 4 image calls at a time.
  - Ad text is checked against the Voice's banned words and the Platform's length limit (`src/lib/ads/platforms.ts`), then regenerated once if it fails.
  - A Platform that fails gives `{ platform, error }` and creates no Ad.
  - TikTok and YouTube fail at once, because the posting service accepts only video for them.
- **Media** is written to `MEDIA_DIR` (default: an OS temp dir) and served by `/api/ads/media/[file]`. Public links use `PUBLIC_BASE_URL`, falling back to `AUTH_URL`. The posting service accepts media only by public https URL.
- **Events:** the five event types are recorded in the store with `recordEvent` and read back through `/api/events`. Sending them to Keewano is parked; issue #14 says how to restore it.
- **Posting service:** Social Streamline over MCP, JSON-RPC over HTTPS with SSE responses; `docs/HANDOFF-LANE-B.md` has the protocol. The site never calls a social platform directly. Posts go draft, then schedule or publish.

## Tests

- Tests live in `tests/`, one file per route area.
- They import the route handler, call it with a `Request` (route params are passed as `{ params: Promise.resolve({ id }) }`), then check the JSON and the store.
- `beforeEach` calls `resetStore()` plus the reset or install helpers for any fakes the file uses, for example `installFakeAds()` from `src/lib/ads/testing.ts`.
- Never make live calls in tests. Each lane does one live smoke run before the demo.

## Domain language

Name types, routes, tests, UI copy and issues with the terms in `CONTEXT.md`: Founder, Company, Document, Brief, Voice, Run, Ad, Variant, Post, Platform, Winner, Carousel, Run time, Time saved. Don't use the synonyms it lists ("user", "campaign", "creative", "channel"). If a change contradicts an ADR, say so explicitly.

## Issues

Use GitHub issues through `gh`. `docs/agents/issue-tracker.md` has the conventions and `docs/agents/triage-labels.md` has the label names. A lane works on its own branch (`lane-b`, `lane-c`) and hands the branch and SHA to the integrator.

## Known limits

- API routes have no session check.
- The store is shared by every user and lost on restart.
- Media in the default `MEDIA_DIR` is lost on redeploy. Before the demo, point it at a Railway volume.
