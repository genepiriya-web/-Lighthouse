# Lighthouse Dispatch — rules for Claude

In-house rental workflow app for Lighthouse Film Service (film lighting and grip rental, Thailand).
Gene (MD) decides. Give pros and cons for every proposal. Never guess facts: write unknowns as open questions.

## Non-negotiable
1. Never call write endpoints on the old system (admin.lighthouse.co.th / api-admin.lighthouse.co.th). Never handle passwords or tokens.
2. Crew national IDs are PDPA data: admin-only, secured store only. Never in code, fixtures, logs, seeds or prompts. Tests use synthetic IDs with valid checksums.
3. `src/logic.js` behaviour is the spec. Keep `npm test` green after every change. If old-system behaviour looks wrong, list it for Gene in `docs/PLAN.md` open questions. Don't change it silently.
4. Small, reviewable commits. Run the tests before saying something works.

## Layout
- `src/logic.js` — pricing, stock, status rules, Cockpit checks. Everything above `/*EXPORTS*/` is inlined into the page.
- `src/app.html` — the page with a `/*@@LOGIC@@*/` slot.
- `scripts/build.js` → `dist/app.html`, the file published as the Claude Artifact.
- `snapshot/published.html` — the live artifact as of version 1792642455-d04d. `test:ui` checks the build matches it; update it only when you republish.
- `data/` — git-ignored. Exports of real data (parity fixtures, master data) live here and never get committed.

- `lib/logic.ts` — the only way the Next.js app imports `src/logic.js` (typed by `src/logic.d.ts`). Server routes and client components both use it.
- `app/` — Next.js (App Router). `app/api/totals` prices a job on the server; `app/price-check.tsx` prices it in the browser.

## Commands
- `npm run build` (artifact page + Next.js) · `npm run build:artifact` · `npm run typecheck`
- `npm test` (unit + parity) · `npm run test:ui` (jsdom, artifact page) · `npm run test:api` (starts the built app, prices every parity job via the API)
- Parity is skipped until `data/parity.json` exists. Build it with `node scripts/make-parity.js <artifact-db-export-dir>`.
- Pin dependency versions exactly, and only to releases at least two weeks old.

## Where things came from
v2 was built by Claude reading the old system in a browser (read-only) and copying its behaviour. The logic is inferred from screens and totals, not from the old system's source. Treat any rule not marked "matches old system" in `docs/PLAN.md` as unconfirmed.
