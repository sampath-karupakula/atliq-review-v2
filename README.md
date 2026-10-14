# AtliQ Review

AtliQ Review is a contract-risk assistant for AtliQ, a founder-led IT services firm with no in-house lawyer. Upload an
incoming contract and it reads every clause, then checks the contract against what AtliQ has already promised other
clients (the register), AtliQ's usual terms, the deal's value, the rules for which AtliQ company signs and under which
law, and the other documents in the same deal.

It returns a risk score, a three-line summary and findings ordered Serious first. Each finding carries a word-for-word
quote, what it means, what it could cost and how to soften it. Anything it couldn't verify sits in a "Not sure" tray.
It **never signs, approves, sends or edits** a contract: it informs, and the founder decides.

This is the second build, rebuilt from the redesigned prototype phase by phase (`ROADMAP.md`). The first build lives at
[sampath-karupakula/atliq-review](https://github.com/sampath-karupakula/atliq-review); its review pipeline is ported here.

**Live demo:** _added after P0 is deployed_

## Run it locally

You need Node 22+, pnpm 10 and Docker.

```bash
pnpm i
cp .env.example .env.local      # fill in the values
docker compose up               # Postgres 16 + the app with hot reload on http://localhost:3000
```

Or run Postgres in Docker and the app on the host:

```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

To try the production image (the same build Vercel runs):

```bash
docker compose --profile prod up --build
```

## Checks

```bash
pnpm check     # typecheck + lint + unit tests
pnpm build
```

CI runs the same on every pull request, plus migrations, a production build and a smoke test against a Postgres service.

## Deploy

Production runs on Vercel (Hobby) with Neon Postgres. The repo is connected to Vercel; every merge to `main` deploys.
Set these in the Vercel project: `DATABASE_URL` (the Neon pooled connection string), `APP_TODAY`, and from P3
`ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`. Apply migrations with `pnpm db:migrate` from a machine holding the Neon URL.

## Status

| Phase | State |
|---|---|
| P0 scaffold, Docker, CI, deploy | in progress |
| P1–P12 | see `ROADMAP.md` |
