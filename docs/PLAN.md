# Lighthouse Dispatch — plan to move daily work into v2

Status: **approved by Gene 23 Oct 2026** · M1–M3 done · M4 slices 1–3 done (job workflow + master data) · all on local Postgres (Supabase project not created yet).

### Progress
| Milestone | State | Evidence |
| --- | --- | --- |
| Parity snapshot | Done | 209/209 jobs and 783/783 lines match the old system (`npm test`). Fixture is pricing fields only, git-ignored |
| M1 Next.js + shared logic | Done | `/api/totals` and the browser give identical totals on all 209 jobs (`npm run test:api`); no sideways scroll at 390 px |
| M2 Schema, RLS, importer | Done locally | `npm run test:db`, 11 tests: RLS forced on every table; no client role (admin included) can write; store can't change prices or move Quote→Order; legacy jobs read-only even to the server; activity append-only; 20 concurrent order numbers unique; import twice = identical rows; all 209 jobs still match the old system when read back from Postgres |
| M3 Order API | Done locally | `npm run test:orders`, 11 end-to-end tests over HTTP on a throwaway database. Store gets 403 changing items/prices or moving Quote→Order. Every guard (customer, dates, items, stock clash across legacy + v2, check-out, check-in) returns its reason. Two saves from one `rev`: one wins, one gets 409. Legacy jobs 409 on every endpoint. One activity row per change. A mutation check (disabling the rev and role checks) made 5 tests fail |
| M4 Screens, slice 1 | Done locally | Jobs list, new job, job sheet (details, items with catalog search and packages, totals, extra discount/adjust/insurance, status moves, CEO price confirmation, check-out/in, history). Thai/English. Walked through in the browser at 390 px as sale → store → CEO → store on the real data: no sideways scroll. Uses the artifact's own CSS and its 298 Thai/English strings |
| M4 Screens, slice 2 | Done locally | Crew picker on jobs (position rates, OT rate, repeated-rate flag, never cost), copy any job (legacy too) as a new quote, send damaged items to repair + Repairs screen. `npm run test:e2e`: Playwright at 390 × 844 walks a job sale → store → CEO → store and checks every screen for content past the screen edge. The real data was also checked by hand (198-job list, a 123-line legacy job) |
| M4 Screens, slice 3 | Done locally | Catalog (admin/store add/edit, packages), Customers (admin/sale add/edit, tax ID only for admin/sale/accounting and never logged, flagged-new review), Crew rates (view only, cost for admin/crew), Team (admin: roles, switch off, never yourself), Settings (admin: company details). Editing an old-system record makes v2 its owner so imports don't overwrite it. `npm run test:master` (7) + phone test. Real data checked by hand at 390 px |
| M4 Screens, slice 4 | Next | Cockpit (problems, money, equipment), Store day view (going out / coming back / overdue — on the artifact, not built yet), Quotation / Draft INV / item-list documents |

**M2 import of the 23 Oct export:** 3,275 products, 192 kit parts, 1,249 customers (1,247 from the old list plus 2 flagged new; 1,047 with tax IDs), 784 crew, 2,582 crew rates (2 marked for review), 106 positions, 209 jobs (all linked to a customer), 3,848 lines, 418 history entries. It took about 0.5 s and skipped nothing.

**How M2 runs locally:** Postgres 17.10 from the `embedded-postgres` npm package. There's no Homebrew or Docker on this Mac. It listens on 127.0.0.1 only, with a generated password kept in git-ignored `.env.local`.

`supabase/local-shim.sql` recreates Supabase's roles, `auth.uid()` and default grants. The migration then runs unchanged on Supabase, and a table that forgets its revoke fails locally too.

**Recommendation in one line:** build a standalone app on Next.js + Supabase Postgres (Singapore region). All writes go through server code that runs the same `logic.js`, and the database refuses direct writes. Fix flaws 1–4 before anyone keys a real job into v2. Move to v2 one job at a time: new jobs start in v2, old jobs finish in the old system.

---

## 0. Step 1 results

### Starting point
The brief assumed a repo with `CLAUDE.md`, tests and a `data/` export. None of it was on this Mac. The design review mentions `lighthouse-dispatch-handoff.zip`, but it was never downloaded. So this repo was rebuilt from the live artifact (version 1792642455-d04d):

| File | What it is |
| --- | --- |
| `src/logic.js` | The `LOGIC-START…LOGIC-END` block from the page, unchanged, plus a `module.exports` footer |
| `src/app.html` | The page with a slot where the logic goes |
| `scripts/build.js` | Rebuilds `dist/app.html`. **The output is byte-identical to the published artifact** (checked with `cmp` and in `test:ui`) |
| `tests/logic.test.js` | 20 unit tests written from the code and the design review's locked case |
| `tests/parity.test.js` | Old-system parity test. It runs only when `data/parity.json` exists |
| `tests/ui.test.js` | 5 jsdom smoke tests against the built page |

The handoff zip had "logic 9 sets, parity, UI 3 sets". These tests are new. If the zip turns up, its tests should be merged in, not discarded.

### Test run: `npm run build && npm test && npm run test:ui`
| Suite | Result |
| --- | --- |
| build | OK. `dist/app.html` equals the published page byte for byte |
| unit (`logic.test.js`) | **20 / 20 pass** |
| parity (`parity.test.js`) | **Skipped.** No `data/parity.json`. The 209/209 match was measured in the artifact session and can't be re-run here yet |
| UI (`ui.test.js`) | **5 / 5 pass**: offline banner, admin tabs, sale vs store buttons, all 299 English strings have Thai, build matches published |

**Decision needed (D0):** may I export a parity snapshot (job header, lines, old-system totals) from the artifact db into git-ignored `data/parity.json`? It holds customer names and amounts. It never includes crew national IDs.

---

## 1. Architecture as it is today

```
admin.lighthouse.co.th  ──read only, Gene's browser login, by hand──▶  Claude sync  ──overwrites──▶  artifact db
(source of truth, team keys work here)                                                              │
                                                                       Lighthouse Dispatch page ◀────┘
                                                                       (one HTML file, all logic in the browser)
```

- **One HTML page** (~138 KB) holds UI, Thai/English text (299 keys each), and logic. No server code of its own.
- **Data:** the artifact's document db. Collections: `orders`, `lines` (one doc per order holding all items), `repairs`, `locks`, `counters`, `catalog`/`kits`/`customers`/`crew` (copied master data stored as large row chunks), `catalogEdits`/`customerEdits` (v2 edits layered on top), `team`, `meta`, `secure/crewIds`.
- **Permissions the db actually enforces:** two levels only. Everyone with access can read and write `orders`, `lines`, `repairs`, `locks`, `counters` and the edit layers. Admin (page owner or Editor) writes master data, `team` and `meta`. Only admin reads `secure`. The roles sale, store, accounting and crew exist only in the page's JavaScript.
- **Logic** (`src/logic.js`): line pricing, order totals with VAT, Weekly/DPW days, package expansion, stock usage and clash, the status machine with role table and guards, and the Cockpit checks (`diagnose`).
- **Writes:** saving items writes `lines/{id}` and then patches `orders/{id}` with totals, usage, rev and log in a second write. A status move is one client-side patch. The client checks `moveCheck` first; the db does not check anything.
- **Concurrency:** a 90-second lease on `locks/{orderId}`, renewed every 45 s. It is advisory: the db does not stop a write from someone without the lease.
- **Order numbers:** a client lease on `counters/orders`, then read, add 1 and write. 6 retries.
- **Activity log:** an array on the order, **trimmed to the last 80 entries**.

### Things in the code Gene should know about (not changed; listed per rule 3)
| # | Behaviour | Why it matters | Proposal |
| --- | --- | --- | --- |
| L1 | Activity log keeps only the last 80 entries per job | Fails "log every change" for long jobs | New app: a separate append-only `activity` table |
| L2 | Admin "Correct status" skips every guard and logs as a normal status move | You can't tell a correction from a real move in the log | Log it as `status_fix` with a required reason |
| L3 | Revealing a crew ID on screen is not logged. Only the CSV download is logged | PDPA: views must be logged per the acceptance criteria | Log every reveal |
| L4 | The customer's default discount is looked up by **customer name**, not ID | Two customers with the same name get the wrong discount | Use customer ID. Needs a check of how often names repeat |
| L5 | Cockpit skips "fuel hour" items by matching descriptions that start with "Hour " | One renamed item breaks the overbook check | Add a flag on the product |
| L6 | Weekly rule: each full week charges `dpw` days, and leftover days are capped at `dpw` | Unconfirmed (flaw 9) | Gene / accounting confirm with 2 real weekly jobs |
| L7 | Insurance is added **before** VAT, so it carries VAT | Unconfirmed (flaw 9) | Accounting confirms |
| L8 | Import auto-fills "adjust" when v2 and old totals differ by ≤ max(฿1,000, 2%) | Small real differences get hidden as adjustments | Keep for legacy import, but list every auto-adjust once for review |

---

## 2. Design flaws: fix, pros and cons, effort

Effort means working days for one developer using Claude Code, including tests. S ≤ 2 days, M 3–5 days, L 6–10 days. These are estimates, not quotes.

### Flaw 1 — Two sources of truth (sync overwrites v2 edits) · High
**Fix:** per-job ownership. Each order gets `owner = 'legacy' | 'v2'`.
- v2 jobs (6909001 and up) are never touched by sync.
- Legacy jobs are read-only in v2 until cutover, enforced by the server and the DB, not just the UI.
- Stock clash checks count both legacy and v2 jobs.
- Cutover per job: none. Legacy jobs finish their life in the old system.
- Retire the old system when it has no open jobs left. At ~200 open jobs that is roughly one rental cycle (to be measured).

| Pros | Cons |
| --- | --- |
| Simple. Never writes to the old system | Staff use two systems during the transition |
| No merge conflicts possible | Stock is only correct if legacy sync is fresh. A stale sync means a missed clash |
| Can start with one salesperson | The old system doesn't know about v2 bookings, so it can double-book v2 stock |

**The last con is the real risk.** Mitigations, choose one:
- (a) Once v2 starts, all new bookings go into v2.
- (b) Sync at least every 2 hours during the transition, and add a Cockpit check for cross-system clashes.

Effort: **M**.

*Alternatives:* (i) Big-bang cutover on one date. Simpler code, but higher risk and every open job gets migrated. (ii) Two-way sync. Rejected: it needs writes to the old system, which rule 1 forbids.

### Flaw 2 — Roles enforced only in the browser · High
**Fix:** clients can't write tables directly.
- Postgres row-level security (RLS) gives each signed-in role read access. Insert, update and delete are denied to the client role.
- Every change goes through a server endpoint (Next.js route handler / server action). The endpoint checks the user's session and role from the `staff` table, then runs `logic.js` (`moveCheck`, `canEditLines`, `orderTotals`, `usageOf`).
- It writes in one transaction with the activity row.

| Pros | Cons |
| --- | --- |
| Same `logic.js` on client and server, so the parity test covers both | A server is now required (hosting cost, someone owns it) |
| One place to audit. RLS is a second wall if the server has a bug | Two layers (server checks + RLS) to keep consistent |
| Easy to test: call the API as a `store` user and expect 403 | |

*Alternative:* all rules in Postgres functions (SQL or PL/pgSQL), with no Node server for writes. Pros: one layer. Cons: pricing gets rewritten in SQL, which breaks "logic.js is the spec" and needs a second parity proof. **Not recommended.**

Effort: **L** (API for orders, lines, moves, check-out/in, master data, plus RLS and tests).

### Flaw 3 — No backups of v2 data · High
**Fix, in two layers:**
1. Supabase's own daily backups. Plan-dependent: check the current plan's retention and whether point-in-time recovery is worth the add-on.
2. Our own nightly `pg_dump` to storage we control (e.g. a scheduled GitHub Action writing to a Google Drive or S3 bucket), kept 30 days.

Restore test: restore last night's dump into a scratch project, then run the importer checks and the parity test against it. Do this once before go-live, then quarterly.

| Pros | Cons |
| --- | --- |
| Survives losing the Supabase account or a bad migration | The dump holds PDPA data: the storage must be encrypted and access-limited |
| Restore is proven, not assumed | Someone must watch for failed backup alerts |

*Interim, for the artifact today:* an admin "Export JSON" button. Downloads only. Effort S, but it puts customer data on a laptop.

Effort: **S–M**.

### Flaw 4 — Sync needs Gene's Mac and login, run by hand · High
**Fix:** this can't be fixed by code alone.
- **Open question for Gene:** who owns the old system's code and database (in-house, a vendor, a freelancer)? Can they give a read-only API key, a read-only DB user, or a nightly export?
- Until then, keep the human-in-the-loop browser sync. Write it as a documented importer (`scripts/import-legacy`) that reads the JSON Claude saves and loads it idempotently. Then only the fetching step stays manual.

| Option | Pros | Cons |
| --- | --- | --- |
| Read-only API key from the owner | Automatic, scheduled, no personal login | Depends on the owner. May cost money |
| Read-only DB replica or nightly dump | Most complete data | Same, plus schema mapping work |
| Keep browser sync (current) | Works today, no one else needed | One person, one Mac. Stale data means missed clashes (see flaw 1) |

Effort: importer **M**. Automation unknown until the owner answers.

### Flaw 5 — Staff skip Shipped/Returned · Medium
Fact: on 22 Oct, 11 jobs went Approve → Draft INV directly in the old system. v2 requires check-out before Shipped and check-in before Returned.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Make check-out/in optional (store can "Ship all as booked" in one tap; log who did it) | Matches how the team works now. Fast | Stock is only as accurate as the bookings. Losses and damage are not recorded |
| B. Keep them required, make them fast: barcode/QR scan on a phone | Real stock, loss and damage tracking. Repairs flow works | Needs labels on ~3,275 products (or only the stocked ones), phones, and training. Slower at first |
| C. A now, B later per department (start with high-value lighting) | Low friction now, a path to accuracy | Two modes to support for a while |

**Recommendation: C**, decided with Gene and Store. Effort: A **S**, B **L**.

### Flaw 6 — Meaning of `stock` not verified (`stock` vs `onHand`) · Medium
**Fix:** Store counts 10–20 items, mixing high-value, packaged and frequently rented ones. Compare the counts with both old-system fields and write down which field means "units we own". No code change until then.
- Pros: cheap, ends the guesswork.
- Cons: needs Store's time, and an item out on rent must be counted as out.

Effort: **S** (half a day of Store time plus 1 hour to record).

### Flaw 7 — Totals and usage stored on the order (denormalized) · Medium
Today two writes (lines, then order) can leave totals out of step with the items.

**Fix:** in Postgres, lines are rows in `order_lines`. The server recomputes totals and usage with `logic.js` and writes lines, totals and the activity row in **one transaction**. Keep stored totals for fast lists, but treat them as a cache. A nightly check recomputes and flags any difference.

| Pros | Cons |
| --- | --- |
| Lists stay fast | A cache to keep honest (the nightly check covers it) |
| No half-saved jobs | |

*Alternative:* compute totals on every read with no stored totals. Simplest correctness, but slower lists and the Cockpit must load every line.

Effort: part of flaw 2.

### Flaw 8 — Quotes that leave the sync window stay as stale "Quote" · Medium
**Fix:** during sync, re-check the status of every legacy Quote no longer in the open list. This is already done for other statuses. Also add a Cockpit rule: a Quote whose ship date is more than 14 days past gets flagged "expired?".
- Pros: Cockpit quote value becomes trustworthy.
- Cons: more reads per sync. The 14-day cut-off is an assumption for Gene to confirm.

Effort: **S**.

### Flaw 9 — Unconfirmed rules · Medium
Rules waiting on answers: VAT on insurance (L7), the Weekly/DPW rule (L6), and who may approve (sale or manager). No code change until answered. When answered, add a unit test that pins the confirmed numbers.

Effort: **S** after the answers.

### Flaw 10 — Crew-ID CSV leaves v2's protection · Medium
| Option | Pros | Cons |
| --- | --- | --- |
| Password-protected PDF (password sent separately) | Works offline for the client | Passwords get reused and forwarded. PDF encryption strength depends on the library |
| Expiring link (signed URL, e.g. 72 h, view-only page, each open logged) | Every view logged. Can be revoked | Client needs internet. Slightly more build |
| Keep CSV, add a watermark and log (today) | No work | The file is out of our control forever |

**Recommendation:** expiring link, IDs shown masked except to the named recipient. Open question: what does the client production actually need (full ID, or last 4 digits)? If masked is enough, the risk mostly goes away.

Effort: **M**.

### Flaw 11 — Order counter uses a client-side lease · Low
**Fix:** a Postgres sequence per Buddhist year (or one sequence with a yearly reset job). The number is assigned inside the create-order transaction.
- Pros: no collisions or retries.
- Cons: sequences can leave gaps on rolled-back creates. Open question: does accounting need gap-free numbers? Tax invoice numbers will need to be gap-free, but order numbers may not.

Effort: **S**.

### Flaw 12 — Hard list limits (1,000 open, 500 closed per status) · Low
**Fix:** server-side pagination and search in Postgres, with indexes on `status`, `no`, `ship`, `customer_id`. Closed jobs stay searchable for years.
- Pros: no ceiling.
- Cons: none worth noting. It comes free with the move.

Effort: part of the build.

### Also needed (from the acceptance criteria, not on the flaw list)
- **Concurrent editing:** optimistic version check (`UPDATE … WHERE id=$1 AND rev=$2`, else 409 "someone saved first, reload"). Keep a soft "X is editing" banner for comfort. Test: two saves with the same `rev`, the second gets 409. Effort **S**.
- **Activity log:** an append-only `activity` table (who, when, what, before/after JSON) written in the same transaction as every change. Fixes L1–L3. Effort **S**.

---

## 3. Stack

### Recommended
| Layer | Choice | Why |
| --- | --- | --- |
| App | **Next.js (TypeScript), App Router** | One codebase for UI and server endpoints. `logic.js` runs in both unchanged |
| Database | **Supabase Postgres, Singapore region** | Real SQL, transactions, sequences, RLS, built-in daily backups, managed |
| Auth | **Supabase Auth**: Google sign-in (built in) to start, LINE as a spike | See the LINE note below |
| Hosting | **Vercel** (or Supabase + any Node host) | Push-to-deploy, preview links for review |
| Tests | Node test runner (existing), Playwright for phone-width UI | Reuses today's tests |

**LINE Login: verified, with one unknown.**
- Supabase does **not** list LINE as a built-in provider ([social login](https://supabase.com/docs/guides/auth/social-login)).
- It does support **custom OAuth/OIDC providers**: up to 3 per project, signed in as `custom:<name>`, with ID tokens checked against the provider's keys ([custom providers](https://supabase.com/docs/guides/auth/custom-oauth-providers), [blog](https://supabase.com/blog/custom-oauth-oidc-providers)).
- LINE Login is OIDC-based, but I have **not verified** that its ID tokens and discovery document pass Supabase's checks.
- Plan: a 1-day spike before committing. If it fails, start with Google or email one-time codes and add LINE through Auth.js later.

### Alternatives compared
| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **Next.js + Supabase** (recommended) | Postgres + RLS + backups managed. One language. Fast to build | Two vendors (Vercel + Supabase). Monthly cost (check current plans) | ✔ |
| SvelteKit or Remix + Supabase | Same backend, lighter front end | Smaller hiring pool in Thailand (assumption, not checked). No real gain for this app | Possible |
| Firebase (Firestore + rules + Functions) | Closest to today's document db, so the port is easier | No SQL joins or sequences. Rules language is weak for pricing. Reporting and invoices are harder later | ✘ |
| Laravel or Rails + Postgres on a VPS | Mature, one server, cheap | `logic.js` must be rewritten in PHP/Ruby, which needs a second parity proof. We own patching and backups | ✘ unless a PHP team takes over |
| Stay on the Claude Artifact, harden it | Zero migration | The artifact db can't enforce roles per path the way needed (flaw 2). No server code. Size limits | ✘ for daily work. Fine as Cockpit until cutover |
| Low-code (Retool, AppSheet, Glide) | Fast screens | Pricing logic, PDPA controls and Thai invoices later are awkward. Lock-in | ✘ |

**Open question:** PDPA cross-border transfer. Hosting in Singapore means personal data leaves Thailand. Ask counsel whether the vendor's terms are enough, or whether a Thai region or consent wording is needed.

---

## 4. Step 2 build order (after approval)
Each milestone is its own small branch with tests, and nothing goes live until M6.

| # | Milestone | Done when | Effort |
| --- | --- | --- | --- |
| M1 | Repo: Next.js + TS, `logic.js` shared unchanged, unit + parity ported | `npm test` green, same numbers | S |
| M2 | Schema + RLS + sequence + `activity` table + importer for `data/` (master data + open jobs, idempotent) | Import twice, same row counts. Store user can't write any table directly | M |
| M3 | Server API: create/edit order, lines with version check, status moves with all guards, check-out/in, master data | Tests: store can't change price or move Quote→Order (403). Stale `rev` gets 409. Guards enforced | L |
| M4 | UI port: Jobs, order sheet, Store, Catalog, Customers, Crew, Repairs, Team, Cockpit. Thai/English. 390 px with no sideways scroll | Playwright at 390 px passes | L |
| M5 | Crew IDs: admin-only table, masked, every view/download logged, expiring link | Tests use synthetic checksum-valid IDs only | M |
| M6 | Backups + restore test. LINE spike outcome. Pilot with one salesperson on new jobs only | Restore proven once. Pilot week with no lost edits | M |

Rough total: 6–9 weeks of one developer's time, before the barcode work (flaw 5B) and invoices. Treat this as an estimate to revisit after M2.

**Leaving room for invoices:** keep `orders` free of invoice fields. Later, add `invoices` and `invoice_lines` tables that reference an order, with their own gap-free number sequence and VAT/WHT fields. Nothing in M1–M6 blocks this.

---

## 5. Open questions for Gene
1. **D0:** OK to export a parity snapshot (no crew IDs) to git-ignored `data/`?
2. Who owns the old system's code and database? Can we get a read-only API key or a DB replica?
3. Who may approve a job: the salesperson, or a manager?
4. Does insurance carry VAT?
5. What is the real Weekly/DPW rule? Please give 2 real weekly jobs to check against.
6. Shipped/Returned: option A, B or C (flaw 5)? Who from Store decides with you?
7. Can Store count 10–20 items to settle `stock` vs `onHand`?
8. What does a client production need from the crew list: full national ID, or masked?
9. Do order numbers need to be gap-free?
10. Sign-in: is LINE a must on day one, or can staff start with Google or email codes?
11. PDPA: is hosting in Singapore acceptable? Who is the data controller contact?
12. Budget ceiling for hosting per month?
13. Where is `lighthouse-dispatch-handoff.zip`? If it exists, its tests should be merged with these.

### Found during M3
21. **Sales changing prices and discounts.** Decided by Gene on 23 Oct 2026. This **replaces** the earlier option (b).
    - **Sales may set any price or discount.**
    - **Before shipping, the CEO must confirm.** A job with lines priced below catalog, discounted on a non-discountable item, or over `maxDisc` can't move to Shipped until the CEO confirms them.
    - **Done:** `POST /api/orders/:id/approve-prices` (admin role). The move to Shipped returns 422 `rPriceApproval` with the unconfirmed lines. Saving items returns `needsCeo`.
    - **What a confirmation covers:** it holds while the line, rule and value stay the same. Changing a confirmed price needs a new confirmation; editing other lines doesn't.
    - **Exempt, as in the Cockpit:** kit parts, crew/freelance lines, lines with no catalog item, and FOC/standby.
    - **Logged:** every confirmation is in the activity log.
    - **Impact on today's data:** 23 of 209 jobs (11%) have at least one line that would need the CEO before shipping.
    - **Q26, confirmed by Gene on 23 Oct 2026:** the gate is the move to **Shipped**, and "CEO" means the **admin role**.
27. **New Thai text needs a native-speaker check.** About 30 strings the artifact never had are written in `lib/i18n.ts` (`extra.th`): test sign-in, CEO price confirmation, save items, reload, legacy notice, and the new history entries. Everything else is the artifact's own text, copied word for word.
29. **Found during slice 2:**
    - **Positions:** 17 positions used by 553 crew rates were missing from the copied position list (probably retired ones). The importer now adds them from the crew records, so every rate shows its position.
    - **My earlier phone-width checks were weaker than reported.** `overflow-x: hidden` on the page clips anything too wide instead of scrolling, so measuring the page width always passed. The browser test now checks that no element runs past the screen edge, and it was proven to catch a deliberately too-wide layout. The real-data screens pass the stricter check.
30. **Found during slice 3 (what the artifact does, copied as-is; please confirm):**
    - **Accounting and crew cost.** The artifact showed crew cost to accounting as well. Your Q15 answer covered admin and the crew manager, so v2 hides cost from accounting. Should accounting see it, for payroll?
    - **Store can change catalog prices and discount limits.** That changes what counts as a "special price" for the CEO check. Should price, discountable and max discount be admin-only?
    - **Crew rates are view-only,** as on the artifact (the role guide says the crew manager handles crew rates, but the artifact never let anyone edit them). Should the crew manager be able to edit rates in v2?
    - **Adding staff** waits for real sign-in (M6). Until then the Team screen changes roles and switches people off.
28. **Local test sign-in.** `/dev-login` lets you pick one of five made-up staff (`node scripts/dev-staff.js`). It works only with `LHD_AUTH=dev` against a database on this Mac. Real sign-in replaces it in M6.
    - **Q24:** some "below catalog" lines may be quotes made before a catalog price went up, not discounts. Should a job keep the catalog price from the day it was quoted?
    - **Q25, decided by Gene on 23 Oct 2026: no.** Sales can still mark lines FOC or standby, as today. Every change, including FOC, is recorded in the activity log.
22. **Not built in M3, still on the artifact only:** copy job as new quote; send damaged items to repair from check-in; catalog/customer edits; Cockpit. They come with M4 (screens), unless you want them earlier.
23. **"Adjust sub total to"** is stored as a fixed ฿ amount (`adjust`), as in the old system. The server accepts the amount. The screen will work it out from the target total, as the artifact does.

### Found during M2 (Gene answered 23 Oct 2026)
| # | Question | Gene's answer | Done |
| --- | --- | --- | --- |
| 14 | Who may see customer tax IDs? (An individual's is their national ID.) | Admin, sale, accounting, for document workflow | Kept as built. Purpose noted on the table |
| 15 | Should sales see crew cost? | No. Sales sees the price we charge | Kept as built |
| 16 | `stock` vs `oneHand` | Asked what this means. Explained below | Still open: Store count |
| 17 | Crew member with the same position listed twice | Keep both: one crew member can do more than one position | Migration 2: every rate row kept (`rate_no`), repeats marked `needs_review`. All 2,582 rows imported |
| 18 | Jobs pointing at missing customers | Add them and flag as new customer | Importer creates them from the job's details with `flagged_new`. It never re-flags or overwrites once a person has checked them |
| 19 | Staff roles on Supabase | Later | Open |

**About Q17:** most crew already have several positions (2,581 rates across 784 crew), and that always worked. The flagged case is different. One crew member has *the same* position (L6 Asst. Head Electrician, Lighting) listed twice: one row at ฿1 for price, OT and cost, the other at ฿45. Both are kept and marked for review. **Q20, answered by the data:** the crew record is named "TestName TestLast (TestNick)". It's a test entry in the old system, not a real person. Both rows stay, flagged.

**About Q18:** the two customers are IDs 1267 and 1268, used by jobs 6902227 and 6902237. They come right after the last customer in the copied list, so they are probably new customers added after the customer list was copied, not deleted ones. The next customer sync will bring their real details. The real record then replaces the placeholder and clears the flag.

**About Q16, `stock` vs `oneHand`:** the old system keeps two counts per item. Across the 1,438 stocked items:
- 1,206 have both counts equal.
- 232 differ. In every one of them `oneHand` is lower, and often negative (Bazooka Set: stock 20, oneHand −17; Aputure 600X: stock 10, oneHand −18).

A count of units owned can't be negative. So `stock` very likely means "units we own" (v2 already uses it for clash checks), and `oneHand` means "available now". It probably drifts negative because staff skip Returned, so the old system never sees the gear come back. This is an inference from the numbers, not confirmed. **Ask Store to count 10–20 of these items**, including a few where the two counts differ, and compare with `stock`.
