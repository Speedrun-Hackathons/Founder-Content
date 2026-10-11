# Handoff: lane C, Ads, analytics and events

Tickets, in order: #6 (Ads in two Variants with Winner pick), #9 (analytics, Keewano events and Run time). Each ticket on GitHub carries its acceptance criteria.

## Setup (10 minutes)

1. `git clone https://github.com/Speedrun-Hackathons/Founder-Content.git founder-content` and `cd founder-content`.
2. `npm install --legacy-peer-deps`, then `npm test` (14 tests pass on main).
3. `cp .env.example .env`; get OPENAI_API_KEY and KEEWANO_API_KEY from the lead directly, never through git.
4. `git checkout -b lane-c`.
5. Read CONTEXT.md (the words), docs/SPEC.md (the behavior), src/lib/model.ts (the types) and src/lib/store.ts (the stand-in data the routes answer today).

## Owned paths

src/lib/ads (OpenAI text, images and carousels), src/lib/analytics, src/app/api/runs, src/app/api/ads, src/app/api/analytics, src/app/api/events, and the Ads, Analytics and Dashboard pages under src/app/(panel). Shared files change only through the integrator.

## Ticket #6, the Ads

1. `POST /api/runs` already refuses an unapproved Brief and unknown platforms; replace the fake Variant text with OpenAI text in the Voice, two Variants per Platform, labels A and B.
2. Images and carousels: generate with the OpenAI image model, store the files under a public path served by the app, and put the resulting https URLs in `mediaUrls`. The posting service accepts media by URL only.
3. `POST /api/ads/{id}/winner` already records the pick; keep the response shape.
4. Stand-in Ad analytics stay labeled `standIn: true` until a real source exists.

## Ticket #9, analytics and events

1. `GET /api/analytics` reads post analytics from the posting service (`get_analytics` over MCP, see docs/HANDOFF-LANE-B.md) and keeps `timeSaved` from the store.
2. Events: the five types in src/lib/model.ts are recorded in the store today. Send each to Keewano when KEEWANO_API_KEY is set: `POST https://api.keewano.com/event/ingress/v1/json/in` with header `k-token`, body `{ dataSessionId, userId, events: [{ eventTypeId, timestamp, data }] }`. No phone numbers, emails or keys in event data. Without the key, `/api/events` keeps reporting `off (no KEEWANO_API_KEY)`.
3. Run time: `markRunPublished` in the store stamps it on the first publish; the Dashboard already shows the total against the survey figure.

## Tests

One test file per route under tests/, with OpenAI and Keewano replaced by fakes. A test proves each event type is sent exactly once at its action.

## Done means

The ticket's checkboxes ticked, `npm test`, `npm run lint` and `npm run build` clean, the branch pushed, and a message to the integrator with the branch name and SHA.
