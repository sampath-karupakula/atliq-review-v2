# Contributing: the branching rule

This repo is built one phase at a time. The rule is enforced by branch protection on `main`, not by habit.

## Branches
- `main` is always deployable. Vercel deploys every merge to `main` to production.
- Each phase gets one branch named `phase/pNN-short-name` (for example `phase/p02-data-seed`), cut from the latest `main`.
- Fixes found after a phase merged go on `fix/short-name`; docs-only changes on `docs/short-name`.
- Nobody commits to `main` directly. Force pushes to `main` are refused.

## Pull requests
- One PR per phase, titled `PNN: what it delivers` (for example `P02: data layer and seed`).
- The PR description lists what was built, the acceptance results from `ROADMAP.md`, and known gaps.
- CI (`.github/workflows/ci.yml`) must be green: typecheck, lint, unit tests, migrations, build, smoke test. It is a required status check.
- Merge with a merge commit (`gh pr merge --merge`) so each phase stays visible in history. Branches are kept after merging.
- Vercel builds a preview for every PR.

## Commits
- Imperative subject, under 72 characters, with the phase prefix when it belongs to one: `P02: seed the register from seed/register.json`.
- Co-authored commits end with the `Co-Authored-By:` trailer.

## Local checks before pushing
```
pnpm check            # typecheck + lint + unit tests
pnpm build            # the same build Vercel runs
docker compose up     # Postgres + app, to try it in a browser
```

## Environments
| Where | Database | How it runs |
|---|---|---|
| Local | Postgres 16 in Docker on port 5433 (`docker compose up -d --wait db`; project `atliq-review-v2`, so it never shares a volume with the first build) | `pnpm dev`, or the whole app in Docker with `docker compose up` |
| Local, production image | the same Docker Postgres | `docker compose --profile prod up` (multi-stage `Dockerfile`, standalone Next build) |
| CI | Postgres 16 service container | migrations + build + smoke test, no AI key |
| Vercel (production and previews) | Neon (pooled connection string in `DATABASE_URL`) | built from GitHub; migrations are applied with `pnpm db:migrate` from a machine that holds the Neon URL, never during the Vercel build |
