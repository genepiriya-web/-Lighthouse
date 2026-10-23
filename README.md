# Lighthouse Dispatch (v2)

Rental workflow for Lighthouse Film Service: quotes → orders → approve → ship → return → draft invoice, with stock clash checks, packages, crew rates, repairs and a CEO Cockpit.

Today v2 runs as a single-page Claude Artifact ("Lighthouse Dispatch") with the artifact's shared database. The old system at admin.lighthouse.co.th is still where the team keys work in. v2 reads synced copies of it.

```bash
npm install
npm run build      # dist/app.html — the page to publish
npm test           # logic unit tests + parity (parity needs data/parity.json)
npm run test:ui    # page boots, roles gate tabs/buttons, Thai strings complete, build == published
```

See `CLAUDE.md` for the rules and `docs/PLAN.md` for the move to a standalone app.
