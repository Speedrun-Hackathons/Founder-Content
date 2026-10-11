# 0001. The site runs on Next.js on Railway and posts through Social Streamline

Date: 2026-10-11

## Status

Accepted

## Context

The product needs a web app with Google sign-in, server-side calls to an image model and to a posting service, and one deploy that a three-person team can ship in a day. Social Streamline writes captions, renders video from uploaded clips and publishes to nine platforms over MCP, but it hosts nothing and makes no images, so the site needs its own stack and its own image model. The alternatives were a Python API plus a static front end (two deploys, sign-in built by hand) or Next.js (one deploy, API routes in the same app).

## Decision

Next.js on Railway. Every call to OpenAI and to Social Streamline runs in a server route with the keys in environment variables; no key reaches the browser. Posts are created as drafts, then scheduled or published through Social Streamline; the site never talks to a social platform directly. Images and carousels come from the OpenAI key.

## Consequences

One deploy and one domain. Hosting moves only with a rewrite of the API routes. Social Streamline's credit balance and its connected accounts bound what the demo can publish, and the site has no fallback publisher.
