# Handoff: lane B, content generation and posting

Tickets, in order: #5 (Company URL and Documents to Brief and Voice), #7 (captions and drafts per Platform), #8 (schedule and publish), #4 (Accounts page). Each ticket on GitHub carries its acceptance criteria.

## Setup (10 minutes)

1. `git clone https://github.com/Speedrun-Hackathons/Founder-Content.git founder-content` and `cd founder-content`.
2. `npm install --legacy-peer-deps`, then `npm test` (14 tests pass on main).
3. `cp .env.example .env`; get OPENAI_API_KEY and SOCIAL_STREAMLINE_API_KEY from the lead directly, never through git.
4. `git checkout -b lane-b`.
5. Read CONTEXT.md (the words), docs/SPEC.md (the behavior), src/lib/model.ts (the types) and src/lib/store.ts (the stand-in data the routes answer today).

## Owned paths

src/lib/content (Brief and Voice), src/lib/social (the posting service client), src/app/api/company, src/app/api/brief, src/app/api/posts, src/app/api/accounts, and the Company, Content and Accounts pages under src/app/(panel). Shared files (model.ts, store.ts, README, package.json) change only through the integrator.

## How the routes change

The route files stay; the fake calls inside them move to real ones. The response shapes in src/lib/model.ts stay fixed, so the pages and tests keep working. A failing service call returns `{ error, message }` with the service's own reason text and a 4xx status; never a 500 and never a silent default.

## The posting service over MCP

Endpoint: SOCIAL_STREAMLINE_MCP_URL, JSON-RPC 2.0 over HTTPS, header `Authorization: Bearer SOCIAL_STREAMLINE_API_KEY`, header `Accept: application/json, text/event-stream`. Responses arrive as server-sent events: read the `data:` line and parse it as JSON.

1. `initialize` once per process (`protocolVersion` 2025-03-26).
2. `tools/call` with `name` and `arguments`:
   - `generate_content` { transcript, platforms, contentType }: one caption per platform in the saved voice; a failed platform carries `error` instead of copy.
   - `create_post` { content, platforms, mediaUrls, selectedAccountIds }: a draft; media must already sit at a public https URL. Instagram and Pinterest need media; TikTok and YouTube take video only.
   - `schedule_post` { id, scheduledFor } and `publish_post` { id }.
   - `list_accounts` {}: the connected accounts (read-only; connecting needs the service's own site).
   - `get_analytics` { days, platform }.
3. `get_credits` {} is the free connectivity check.

## Tests

One test file per route under tests/, calling the handler with a Request, with the posting service and OpenAI replaced by fakes that return recorded shapes. One live smoke call per tool before the demo, logged in the ticket.

## Done means

The ticket's checkboxes ticked, `npm test`, `npm run lint` and `npm run build` clean, the branch pushed, and a message to the integrator with the branch name and SHA.
