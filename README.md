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

Seed the demo data and accounts once (`SEED_USER_PASSWORD` in `.env.local` sets the password of the six demo
accounts: karandeep@, bhavin@, dhaval@, jay@, pranav@ and counsel@atliq.test):

```bash
pnpm seed           # demo data + accounts; pnpm seed:users adds only the accounts and keeps the data
```

Re-seeding never changes an existing account's password. After changing `SEED_USER_PASSWORD`, set the six demo
accounts to it (this also unlocks them and signs them out):

```bash
pnpm seed:users --reset-passwords
```

### Signing in
With `DEMO_MODE=1` (the default in `.env.example`) nobody needs to sign in: the "Viewing as" switch in the top bar
picks Karandeep (admin), Bhavin (reviewer) or Counsel (read-only), and the sign-in page offers the same choice. A real
sign-in always wins over the switch. Leave `DEMO_MODE` unset on a real deployment: every page, action and API route
then needs an account, five wrong passwords lock an account for 15 minutes, and admins manage people at `/admin/users`.

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
Set these in the Vercel project: `DATABASE_URL` (the Neon pooled connection string), `APP_TODAY`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and either `DEMO_MODE=1` (a public demo) or `SEED_USER_PASSWORD` with
`SEED_FORCE_PASSWORD_CHANGE=1` (real accounts). Apply migrations with `pnpm db:migrate` from a machine holding the Neon URL.

## Status

| Phase | State |
|---|---|
| P0 scaffold, Docker, CI, deploy | in progress |
| P1–P12 | see `ROADMAP.md` |
