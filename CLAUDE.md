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
- `data/` — git-ignored. Exports of real data (`data/export/` artifact db dump, `data/parity.json`) live here and never get committed. Never export the artifact's `secure` collection.
- `lib/logic.ts` — the only way the Next.js app imports `src/logic.js` (typed by `src/logic.d.ts`). Server routes and client components both use it.
- `app/` — Next.js (App Router). `app/api/totals` prices a job on the server; `app/price-check.tsx` prices it in the browser.
- `supabase/migrations/` — schema, RLS, guards. Same SQL on Supabase and local. `supabase/local-shim.sql` fakes Supabase's roles/`auth.uid()` locally; never apply it to Supabase.
- `scripts/db.js` (local Postgres 17 in `.pgdata/`, git-ignored) · `scripts/migrate.js` · `scripts/import.js` (idempotent loader for `data/export`).

## Database rules (enforced by tests/db.test.js — keep them true)
- Every public table: RLS enabled and forced, SELECT policies only. Client roles (`anon`, `authenticated`) never write; all writes go through the server as `service_role` after running `logic.js`. A new table must be added to the RLS block in the migration and to `ALL_TABLES` in the test.
- `orders.owner = 'legacy'` rows (and their lines) are read-only to everyone but the importer. The importer never touches `owner = 'v2'` / `source = 'v2'` rows.
- `activity` is append-only for everyone. `customer_tax_ids` (individuals' tax ID = national ID): admin/sale/accounting only. `crew_rate_costs`: admin/crew only.
- Don't edit an applied migration once it has run on Supabase; add a new one. (Before then, editing `…_init.sql` and resetting local is fine.)

## Server rules (enforced by tests/orders-api.test.js)
- Every change to a job goes through `lib/server/orders.ts`, inside `tx()` (service_role). It locks the row, refuses legacy jobs (409 `legacy_read_only`), checks the role with `logic.js` (`moveCheck`, `canEditLines`) plus the artifact's header/money/store rules, checks `rev` (409 `stale`), recomputes totals/usage from stored lines, bumps `rev`, and writes one `activity` row. Never trust totals sent by a client.
- Routes in `app/api/**` stay thin: parse, `requireStaff`, call the service.
- `LHD_AUTH=dev` (header `x-dev-user`) is for local dev/tests only and refuses to run unless `DATABASE_URL` is on this machine. Real sign-in (Supabase) is M6; until then every non-dev request is 401.

## Commands
- `npm run build` (artifact page + Next.js) · `npm run build:artifact` · `npm run typecheck`
- `npm test` (unit + parity) · `npm run test:ui` (jsdom, artifact page) · `npm run test:api` (starts the built app, prices every parity job via the API)
- `npm run db:start` · `npm run db:migrate` · `npm run db:import` · `npm run test:db` (throwaway database per run) · `npm run db:stop`
- `npm run test:orders` — starts the built app on a throwaway database and drives the order API as each role (needs `npm run build` + local Postgres)
- Parity is skipped until `data/parity.json` exists. Build it with `node scripts/make-parity.js <artifact-db-export-dir>`.
- Pin dependency versions exactly, and only to releases at least two weeks old.

## Where things came from
v2 was built by Claude reading the old system in a browser (read-only) and copying its behaviour. The logic is inferred from screens and totals, not from the old system's source. Treat any rule not marked "matches old system" in `docs/PLAN.md` as unconfirmed.
