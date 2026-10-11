# Founder Content

Founder Content takes a company URL and turns it into social posts and ads: it builds a Brief and a Voice from the site, generates two Variants per platform, lets the Founder pick the Winner, and schedules or publishes the result to the connected social accounts. Built at SpeedHacks, the SF Tech Week hackathon, on 2026-10-11.

Documents: [CONTEXT.md](CONTEXT.md) (the glossary), [docs/SPEC.md](docs/SPEC.md) (the spec), [docs/adr/](docs/adr/) (decisions), [docs/agents/](docs/agents/) (issue tracker and label conventions).

## Run locally

    git clone https://github.com/Speedrun-Hackathons/Founder-Content.git founder-content
    cd founder-content
    npm install --legacy-peer-deps
    cp .env.example .env
    npm run dev

Open http://localhost:3000. Every panel page needs a signed-in session; without DEMO_EMAIL and DEMO_PASSWORD in `.env` the sign-in page says so and stops there.

## Configure

`.env` is ignored by git; `.env.example` lists every variable with an empty value:

| Variable | Needed for |
|---|---|
| AUTH_SECRET | session signing; any random 32-byte string |
| DEMO_EMAIL, DEMO_PASSWORD | the one sign-in account; email and password, compared on the server |
| AUTH_URL | the public base URL of the deployment |
| OPENAI_API_KEY | Brief, Voice, ad text, images |
| KEEWANO_API_KEY | not used yet: sending events to Keewano is parked, and events stay in the store |
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

## Posting service MCP

To use the posting service's tools from a coding agent, put the key in `.env` as SOCIAL_STREAMLINE_API_KEY and run, from Git Bash in the repository:

    set -a; . ./.env; set +a
    claude mcp add --transport http social-streamline https://socialstreamline.me/mcp --header "Authorization: Bearer $SOCIAL_STREAMLINE_API_KEY"

The key arrives by direct message from the lead and is revoked on 2026-10-13; after that date the command needs a new key.

## Limits of this build

- The API routes carry no session check; the panel pages do. Anyone with the URL can call a route, so the deployment stays private until a route guard lands.
- The store is one in-process object shared by every signed-in user and reset on every restart; the live services replace it lane by lane.
- One shared sign-in account from the environment; no user table yet.

## Not in the repository

Keys and secrets (`.env`), the Railway project, the posting-service workspace and its connected accounts.
