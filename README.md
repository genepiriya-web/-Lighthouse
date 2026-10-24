# Lighthouse Dispatch (v2)

Rental workflow for Lighthouse Film Service: quotes → orders → approve → ship → return → draft invoice, with stock clash checks, packages, crew rates, repairs and a CEO Cockpit.

Today v2 runs as a single-page Claude Artifact ("Lighthouse Dispatch") with the artifact's shared database. The old system at admin.lighthouse.co.th is still where the team keys work in. v2 reads synced copies of it.

The standalone app (Next.js) is being built alongside it, milestone by milestone (see `docs/PLAN.md` §4). M1 is done: the app shares `src/logic.js` unchanged between server and browser.

```bash
npm install
npm run build      # dist/app.html (artifact page) + .next (standalone app)
npm run typecheck
npm test           # logic unit tests + parity (parity needs data/parity.json)
npm run test:ui    # artifact page boots, roles gate tabs/buttons, Thai strings complete, build == published
npm run test:api   # built app's /api/totals equals logic.js on synthetic cases and every parity job
npm run dev        # http://localhost:3000 — price check page (Thai/English)

npm run db:start   # local Postgres 17 on 127.0.0.1:54329 (no Homebrew/Docker; data in .pgdata/)
npm run db:migrate # schema + row-level security
npm run db:import  # load data/export (artifact db dump) — safe to re-run
npm run test:db    # RLS, ownership, append-only log, order numbers, importer idempotency
npm run test:orders # order API end to end, as each role (after npm run build)
npm run test:master # catalog, customers, crew rates, team, settings — roles, privacy, re-import safety
npm run test:slice4 # cockpit (admin) and job documents over HTTP
npm run test:crewids # crew national IDs: admin-only, encrypted, logged, client links
npm run test:backup # encrypted backup → restore → every table identical
npm run test:auth  # Supabase token checks, invites, CSRF (fake Supabase)
npm run backup && npm run backup:verify -- data/backups/<file>.lhdbk   # back up, then prove it restores
npm run test:e2e   # Playwright at 390 px: a job's life as sale → store → CEO → store (after npm run build)
```

### Order API (M3)
All writes need `rev` (the version you read) and return the new `rev`; a stale `rev` gets `409 stale`. Legacy jobs answer `409 legacy_read_only`.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/me` | any staff |
| GET | `/api/orders?status=open&q=&limit=&before=` | any staff |
| POST | `/api/orders` | sale, admin |
| GET | `/api/orders/:id` (job, lines, activity) | any staff |
| PATCH | `/api/orders/:id` (details; extraDisc/insurance/adjust) | details: sale (Quote/Order), admin · money: also accounting |
| PUT | `/api/orders/:id/lines` | sale (Quote/Order), admin (to Approve). Returns `needsCeo`: special prices still to confirm |
| POST | `/api/orders/:id/approve-prices` | CEO (admin). Needed before Shipped when `needsCeo` isn't empty |
| POST | `/api/orders/:id/move` `{ to }` | per `moveCheck` in `logic.js` |
| POST | `/api/orders/:id/checkout` / `checkin` | store, admin |
| POST | `/api/orders/:id/fix-status` `{ to, reason }` | admin |
| POST | `/api/orders/:id/copy` | sale, admin (any job, legacy too → new v2 quote) |
| POST | `/api/orders/:id/repairs` | store, admin (Shipped/Returned; damaged lines → tickets) |
| GET / PATCH | `/api/repairs`, `/api/repairs/:id` `{ status, note }` | read: any staff · change: store, admin |
| GET | `/api/products`, `/api/crew` | any staff (job pickers; no crew costs) |
| GET / POST | `/api/catalog`, GET / PATCH `/api/catalog/:id` `{ updatedAt, … }` | read: any staff · change: admin, store |
| GET / POST | `/api/customers`, GET / PATCH `/api/customers/:id` `{ updatedAt, … }` | read: any staff (tax ID: admin, sale, accounting) · change: admin, sale |
| GET | `/api/crew-rates` | any staff; cost only admin, crew manager |
| GET / PATCH | `/api/staff`, `/api/staff/:id` `{ role, active }` | admin (not yourself) |
| GET / PUT | `/api/settings`, `/api/settings/company` | read: any staff · change: admin |
| GET | `/api/cockpit` | admin (logic.js `diagnose` over all open jobs) |
| GET · POST | `/api/crew-ids` (masked) · `/api/crew-ids/import` `{ text, save }` | admin |
| POST · DELETE | `/api/crew-ids/:crewId/reveal` (logged) · `/api/crew-ids/:crewId` | admin |
| GET · POST | `/api/orders/:id/crew` · `/api/orders/:id/crew-links` `{ recipient, hours, show }` | admin; the link is returned once |
| POST | `/api/crew-links/:linkId/revoke` | admin |
| GET · POST · DELETE | `/api/staff/invites`, `/api/staff/invites/:email` | admin |
| GET · POST | `/share/crew/:token` | anyone with the link: GET shows a button, POST shows the list (counted, logged) |
| GET | `/api/orders/:id/document?kind=quote\|draft\|items&disc=1\|0` | any staff (HTML file, as the artifact downloaded) |

### Try the screens locally
```bash
npm run db:start && npm run db:migrate && npm run db:import
node scripts/dev-staff.js          # five made-up staff, one per role (db:start also writes a local CREW_ID_KEY)
npm run build
LHD_AUTH=dev npm start             # then open http://localhost:3000/dev-login
```
`/dev-login` picks a test staff member (works only against a local database). API callers can send `x-dev-user: <staff user id>` instead.

### Real sign-in (Supabase)
Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and leave `LHD_AUTH` unset; staff sign in at `/signin`. The first admin is invited with `node scripts/invite.js <email> admin`. Full checklist: `docs/GO-LIVE.md`.

See `CLAUDE.md` for the rules and `docs/PLAN.md` for the move to a standalone app.
