# Founder Content: spec

## Problem Statement

A Founder running a company alone or with a small team spends one to three hours a week writing social posts, making images, cutting video and scheduling them across platforms, and has no way to know which version of an Ad works. The work is repetitive, the tools are scattered, and the content stops the moment the Founder gets busy.

## Solution

One site. The Founder signs in with Google, pastes the Company URL and uploads Documents, approves a Brief and a Voice, and from then on generates text posts, images, carousels, short and long videos and Ads in two Variants per Platform, schedules or publishes them through the posting service, picks the Winner of each A and B pair, and reads analytics for posts and Ads in one panel. The site stamps the Run time of every Run so the hours given back are measured, not claimed.

## User Stories

1. As a Founder, I want to sign in with Google, so that I reach my panel without a new password.
2. As a Founder, I want a left-side navigation with Dashboard, Company, Content, Ads, Accounts and Analytics, so that every function is one click away.
3. As a Founder, I want to paste my Company URL, so that the site reads my product without me retyping it.
4. As a Founder, I want to upload Documents, so that the Brief rests on more than the home page.
5. As a Founder, I want to read and edit the Brief before anything is generated, so that nothing goes out on a wrong description.
6. As a Founder, I want a Voice derived from the Brief, so that every text sounds like my company.
7. As a Founder, I want to edit the Voice, so that I can correct tone and banned words.
8. As a Founder, I want text posts generated per Platform (X, LinkedIn and the others), so that each post fits its platform.
9. As a Founder, I want images generated for Instagram, LinkedIn and X, so that posts carry visuals.
10. As a Founder, I want Carousels for Instagram and LinkedIn, so that one idea runs across several images.
11. As a Founder, I want short-form videos rendered from clips I uploaded, so that TikTok and Reels get vertical video.
12. As a Founder, I want long-form videos rendered from clips, so that YouTube gets landscape video.
13. As a Founder, I want every generated item saved as a draft first, so that nothing is sent without my look.
14. As a Founder, I want to schedule a draft with a send time, so that posts go out while I work on something else.
15. As a Founder, I want to publish a draft now, so that a demo or a launch goes out on the spot.
16. As a Founder, I want Ads generated in two Variants per Platform, so that I can compare A and B.
17. As a Founder, I want to pick the Winner by hand, so that the better Variant is the one that keeps running.
18. As a Founder, I want Ad analytics shown per Variant, so that the pick has numbers next to it, even when those numbers are stand-ins today.
19. As a Founder, I want post analytics from the posting service, so that I see reach and engagement without opening nine apps.
20. As a Founder, I want an Accounts page listing my connected platforms, so that I know where posts can go.
21. As a Founder, I want a platform without a connection to show as not connected with a link to connect it in the posting service, so that I am not surprised at publish time.
22. As a Founder, I want the Run time shown after each Run and summed on the Dashboard, so that I see the hours given back.
23. As a Founder, I want a refused publish to show the platform's own reason, so that I can fix the post instead of guessing.
24. As a Founder, I want generation failures per Platform shown next to the ones that worked, so that one failure never hides the rest.
25. As a Founder, I want my keys kept on the server, so that nothing secret reaches the browser.

## Implementation Decisions

- Next.js on Railway, one deploy, Google sign-in. Recorded in ADR 0001.
- Every call to OpenAI and to the posting service runs in a server route; the browser calls only the site's own routes.
- Text generation for posts goes through the posting service's caption tool in the saved Voice; Ads text and all images go through OpenAI.
- Images are stored by the site at a public https path, since the posting service accepts media only by URL.
- Posts are created as drafts, then scheduled or published; the site never calls a social platform directly.
- Video renders are queued as jobs and polled until a terminal status; the panel shows queued, running, needs action, succeeded, failed.
- Accounts are read from the posting service; connecting a new one happens in the posting service's own site, linked from the Accounts page.
- Keewano receives five events: brief_approved, run_started, variant_generated, winner_picked, post_published.
- Ad analytics are stand-in numbers until an ads analytics source exists; the panel labels them as such.
- One data model holds Founder, Company, Document, Brief, Voice, Run, Ad, Variant, Post, Winner, Run time, Time saved, as defined in CONTEXT.md.
- Three lanes own separate folders: the shell and hosting; content generation and posting; Ads and testing. The data model and the route list are agreed before the lanes start.

## Testing Decisions

- A good test drives a server route with a request and checks the response and the stored state; it never reaches into a module's internals.
- The posting service and OpenAI are replaced by recorded fakes in tests; one live smoke run per lane proves the real call before the demo.
- Modules under test: the Brief and Voice builder, the generation routes, the draft, schedule and publish routes, the Accounts and Analytics readers, the Run time stamp.
- Prior art: none in this repository; the first test file sets the pattern.

## Out of Scope

- Pricing and billing.
- Real ad-platform analytics.
- Connecting social accounts from inside the site.
- Multiple companies per Founder.
- Mobile layout beyond what the left-nav panel does by default.

## Further Notes

- The posting service generates no images through its tool interface; any later image tool there replaces one function.
- The demo publishes for real on the connected accounts, so the demo Company is a teammate's own company.
- The time-saved figure for the deck comes from two downloaded surveys and the measured Run time.
