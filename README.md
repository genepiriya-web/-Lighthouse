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
| PUT | `/api/orders/:id/lines` | sale (Quote/Order), admin (to Approve). Below catalog price or over the discount limit: admin only (403 `price_rule`) |
| POST | `/api/orders/:id/move` `{ to }` | per `moveCheck` in `logic.js` |
| POST | `/api/orders/:id/checkout` / `checkin` | store, admin |
| POST | `/api/orders/:id/fix-status` `{ to, reason }` | admin |

Locally, run `LHD_AUTH=dev npm start` and send `x-dev-user: <staff user id>`. Real sign-in comes with Supabase (M6).

See `CLAUDE.md` for the rules and `docs/PLAN.md` for the move to a standalone app.
