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
```

See `CLAUDE.md` for the rules and `docs/PLAN.md` for the move to a standalone app.
