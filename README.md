# Founder Content

Founder Content takes a company URL and turns it into social posts and ads: it builds a Brief and a Voice from the site, generates two Variants per platform, lets the Founder pick the Winner, and schedules or publishes the result to the connected social accounts. Built at SpeedHacks, the SF Tech Week hackathon, on 2026-10-11.

Documents: [CONTEXT.md](CONTEXT.md) (the glossary), [docs/SPEC.md](docs/SPEC.md) (the spec), [docs/adr/](docs/adr/) (decisions), [docs/agents/](docs/agents/) (issue tracker and label conventions).

## Run locally

    git clone https://github.com/Speedrun-Hackathons/Founder-Content.git founder-content
    cd founder-content
    npm install --legacy-peer-deps
    cp .env.example .env
    npm run dev

Open http://localhost:3000. Every panel page needs a signed-in session; without Google credentials in `.env` the sign-in page says so and stops there.

## Configure

`.env` is ignored by git; `.env.example` lists every variable with an empty value:

| Variable | Needed for |
|---|---|
| AUTH_SECRET | session signing; any random 32-byte string |
| AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET | Google sign-in (an OAuth client from the Google Cloud console, redirect URI `BASE_URL/api/auth/callback/google`) |
| AUTH_URL | the public base URL of the deployment |
| OPENAI_API_KEY | Brief, Voice, ad text, images |
| KEEWANO_API_KEY | the event stream; empty means events stay local and `/api/events` reports `off (no KEEWANO_API_KEY)` |
| SOCIAL_STREAMLINE_API_KEY, SOCIAL_STREAMLINE_MCP_URL | captions, drafts, scheduling, publishing, accounts, analytics |

Keys are passed between teammates directly, never through the repository.

## Check

    npm run typecheck
    npm run lint
    npm test
    npm run build

`npm test` runs the route tests (vitest) against the in-process store; no network is needed.

## Routes

| Route | Purpose |
|---|---|
| GET /api/health | ok, build id, time |
| GET, POST /api/company | the Company, its Documents, Brief and Voice; POST builds them from a URL |
| GET, PUT /api/brief | read, edit and approve the Brief and Voice |
| GET, POST /api/runs | Runs; POST generates two Variants per platform (needs an approved Brief) |
| GET /api/ads, POST /api/ads/{id}/winner | Ads for a Run; pick the Winner |
| GET, POST /api/posts, POST /api/posts/{id}/schedule, POST /api/posts/{id}/publish | drafts, schedule with a send time, publish now |
| GET /api/accounts | connected accounts and the platforms without one |
| GET /api/analytics | post and ad analytics plus time saved |
| GET, POST /api/events | the five event types |

Every route answers JSON; an error is `{ "error": code, "message": text }` with a 4xx status that names the bad value. The store behind the routes is in-process and seeded with stand-in data; each lane replaces its part with the live service.

## Deploy

Railway reads `railway.json`: Nixpacks build, `npm run start`, health check on `/api/health`. Set the variables above in the Railway service; the app listens on the port Railway provides.

## Not in the repository

Keys and secrets (`.env`), the OAuth client, the Railway project, the posting-service workspace and its connected accounts.
