# Lighthouse Dispatch — plan to move daily work into v2

Status: **approved by Gene 23 Oct 2026** · M1–M5 done · M6 code done · **staff trial (stage 1, look-only, on Gene's Mac) ready for the Tuesday meeting** · then Supabase + go-live (docs/GO-LIVE.md) · all on local Postgres (Supabase project not created yet).

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
| M4 Screens, slice 4 | Done locally | Cockpit (admin; problems, money, equipment). Store day view. Quotation / Draft INV / Item list with or without discount, as an HTML download and a sandboxed preview. `lib/docs.js` produces byte-identical HTML to the artifact for all 5 variants (`tests/docs.test.js` runs the artifact's own code to compare). On the real data the server Cockpit matches `diagnose()` on the original export exactly: 59 problems by kind, ฿2,071,742.48 confirmed. Only the 2 local test jobs add 2 "price changed" flags |
| M5 Crew national IDs | Done locally | Admin-only. Stored encrypted (AES-256-GCM, key `CREW_ID_KEY` outside the database); only the last 3 digits in clear for the mask. No client role can read the tables, admin included, so every full ID goes through the server: each "Show" and each client-link opening is logged (who/when/which crew or link), never the ID itself. Import by paste or file with checksum, matched by code / crew number / name, preview masked before saving. The CSV download is replaced by expiring client links: hours chosen, view limit, revocable, full or masked, token shown once and only its hash stored. Opening a link shows a button only; IDs are sent on the tap (POST), so LINE link previews never receive them. `npm run test:crewids` (7) + phone test |
| M6 Go-live (code) | Done locally | **Backups:** encrypted logical backup (AES-256-GCM under `BACKUP_KEY`) with per-table fingerprints. **Restore tested on the full local copy of the real data: all 18 tables identical** (211 jobs, 3,850 lines, 3,275 products, 1,249 customers, 426 history entries). Nightly GitHub Actions backup + weekly restore test ready. **Sign-in:** Supabase tokens verified on the server (key list for RS256/ES256; `/auth/v1/user` for legacy HS256, per Supabase docs). Cookie only for page reads, so no CSRF. Staff join by email invite on first sign-in. Sign-in page with emailed 6-digit code or Google. `npm run test:backup` (4), `npm run test:auth` (5, against a fake Supabase) |
| Bug reports, level 1 | Done locally | Gene, 25 Oct: level 1 only (report in the app + Discord notice; no AI auto-fix). The Feedback button now asks the type (bug / confusing / idea / other) and attaches browser, screen size, language and the last 10 screen/server errors. Each report is saved first, then announced in Discord with type, page, department, number and a link back. No text or customer data unless `DISCORD_INCLUDE_TEXT=1`, and no @mentions. If Discord is down, the report is kept and retried. 20 reports per person per hour. `npm run test:notify` (4, fake Discord) + phone test. Discord itself is off until Gene adds `DISCORD_WEBHOOK_URL` |
| Quotation PDF (paper form) | Done locally | Gene, 27 Oct: option B. The job page has "Download PDF" for the quotation, in the layout of the old system's printout: page 1 summary (7 types, VAT, remark, hirer's signature), then detail tables per type, "<no>-<rev> (Page x/y)" on every page. The server draws it with headless Chromium (`playwright-core`). Money is the same logic.js numbers as the HTML quotation (`tests/quoteform.test.js`, 4 + 1 API test). Logo: `assets/logo.png` (Gene, 27 Oct). See Q38 |
| Store addition | Done locally | Gene, 27 Oct: while a job is at Approve, Store presses "+ Urgent items" and gets a separate job linked to it, status **Store Add**. It holds stock at once; Store adds items (not crew) with no prices; Sales sets the prices and moves it to Approve, then it ships through the normal flow. The main job and its quotation don't change. v2 rule in `lib/rules.ts` (logic.js unchanged); migration 0009. See Q39 |
| Sales person list | Done locally | Gene, 27 Oct: the job's sales person is a dropdown: เชอร์รี่, เบนซ์, สอง (new job and job details). The server refuses other names; a job keeps an older name it already has (e.g. "cherry" on old-system jobs). Default list in `lib/rules.ts`; a `sales_people` setting can replace it (no edit screen yet) |
| Support role, date owners, customer dropdown | Done locally | Gene, 27 Oct: Support is its own role with Sales' rights (part of approved M7a; migration 0010, `app_role()` reports it as sale). Store may change the return date from Quote up to Shipped; a stock clash from new dates is saved but reported. Customer is a search dropdown on the new-job form and the job details. "Days per week" shows only for Weekly |
| M7 Job sheet | Approved 26 Oct, not started | 7a Support role + handoff + 16-hour cue CEO approval, then 7b job-sheet record (option A). Starts after the Tuesday feedback fixes. 36a (OT rule) is needed before 7b can show baht. See §6 |
| M6 Go-live (Gene) | Waiting | `docs/GO-LIVE.md`: Supabase project, keys, migrate/import, Vercel, backup secrets + first production restore test, invites, LINE spike, one-week pilot |
| Staff trial, stage 1 | Ready | Gene asked on 24 Oct to let staff try it at the Tuesday meeting without any risk to live work. `npm run trial` runs v2 on this Mac for phones on the office Wi-Fi: **one PIN per department** (Sales, Store, Support, Accounting, System admin; Gene, 24 Oct) and the PIN decides the account (10 wrong tries → 10-minute block), a trial banner on every screen, a Feedback button on every screen (admin reads them under Feedback), Thai trial accounts, and clean data (209 old-system jobs, no test jobs). The old system is never written to. Guide: `docs/TRIAL-TH.md`. `npm run test:trial` (4). Before the meeting: sync the old system into the artifact (last sync 23 Oct 10:50), then re-import |
| Staff trial, stage 2 | Next | One salesperson enters 5–10 new jobs in both systems; the old system stays official. Planned: an automatic comparison report |

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
30. **Found during slice 3. Gene, 23 Oct 2026: keep as built** (accounting doesn't see crew cost; store can edit catalog prices; crew rates stay view only):
    - **Accounting and crew cost.** The artifact showed crew cost to accounting as well. Your Q15 answer covered admin and the crew manager, so v2 hides cost from accounting. Should accounting see it, for payroll?
    - **Store can change catalog prices and discount limits.** That changes what counts as a "special price" for the CEO check. Should price, discountable and max discount be admin-only?
    - **Crew rates are view-only,** as on the artifact (the role guide says the crew manager handles crew rates, but the artifact never let anyone edit them). Should the crew manager be able to edit rates in v2?
    - **Adding staff** waits for real sign-in (M6). Until then the Team screen changes roles and switches people off.
31. **Found during slice 4:**
    - **The importer now recomputes totals and stock usage with `logic.js`** instead of copying the artifact's cached values (flaw 7). On the 209 real jobs the values are identical, field by field; a job without cached totals would otherwise have shown as a false "mismatch".
    - **Remark/footer templates come from the old system as HTML.** Documents keep only plain text tags (p, br, b, strong, i, em, u, ul, ol, li, span, div) with no attributes. The preview runs in a sandboxed frame under a no-script content policy.
    - **Documents aren't logged as activity** (viewing isn't a change), same as the artifact. The crew-ID list is different: it will be logged on every view and download (M5).
32. **Crew IDs (M5): what you need to know.**
    - **Moving the IDs over.** The IDs in the artifact's secured store were not exported (rule 2). An admin imports them into v2 from your own file with **Crew rates → Import national IDs**, as you did for the artifact.
    - **`CREW_ID_KEY` is the only way to read the stored IDs.** Production needs its own key in the hosting settings, kept somewhere safe apart from the database backups. If it's lost, the IDs have to be imported again; nothing else is affected.
    - **Q8, answered by Gene on 23 Oct 2026:** productions need the full ID. Full stays the default; masked links remain an option.
    - **The link token is part of the web address,** so the hosting provider's request logs may record it. Only a hash is stored in the database, and links expire (at most 7 days) and can be revoked.
33. **Found during M6:**
    - **LINE Login:** LINE web-login ID tokens are HS256 (channel secret), and Supabase's custom OIDC checks ID tokens against a published key list, so OIDC mode most likely fails. The spike should try Supabase's custom OAuth2 mode with LINE's userinfo endpoint, and needs LINE's email permission for invites to match. Start with email code / Google. Details in GO-LIVE.md §7.
    - **To check on the real project:** whether the app's database user can `set role service_role` (one SQL line in GO-LIVE.md §3). Until checked, it's an assumption.
    - **"Email verified":** an invite is claimed only when the token doesn't say the email is unverified. Email-code sign-in proves the address; Google sends `email_verified`.
34. **Support's role (Q34). Gene, 24 Oct 2026: Support uses the same permissions as Sales for now.** A separate Support role can come later, once its day-to-day work is described (see also the 6 → 2 Support plan question).
35. **Bug reports to Discord (Q35). Gene, 25 Oct 2026: level 1 only.** Open points:
    - **Report text in Discord:** off by default, because staff may name customers and Discord is a service outside the company (PDPA). Pro of turning it on (`DISCORD_INCLUDE_TEXT=1`): the team can read the problem without opening the app. Con: customer names could end up in Discord history. Your call.
    - **Who should see the Discord channel?** Anyone with the channel sees every report number, page and department. Suggest a private channel for you plus whoever fixes things.
    - **Retry timing:** an unsent report is retried only when someone sends another report or an admin opens Feedback. No background timer, so a report can sit unsent if nobody does either. On Vercel later, a scheduled retry can be added if this matters.
36. **Company workflow report (Q36), from Gene's assistant, 26 Oct 2026** (Workflow_Report.pdf: 7 departments, the job sheet is the control point). Gene's answers, 26 Oct:
    - The report is Lighthouse's own, written by his assistant.
    - Field crew are **both** staff and freelancers. v2 already tells them apart: line type 5 = crew, 7 = freelance.
    - **1 cue = 12 hours.** Some jobs use **1 cue = 16 hours, which needs the CEO's approval before the job is accepted.**
    - **The signed job sheet stays on paper** (legal effect). v2 records its numbers and a scan; it doesn't replace it.
    - Crew are paid on the same cycle as company staff.
    - About **45–50 vehicles**.
    - Still open:
      - **36a:** When does OT start: after the cue's 12/16 hours on location, or from call time? Is it rounded (to 30 min, 1 hour)? Is the rule the same for billing the client and paying crew?
      - **36b:** Do freelancers have 3% withholding tax deducted, and does HR need that in the crew summary?
      - **36c:** Are vehicles rented to clients as items (e.g. grip/generator trucks in the catalog), only used for transport, or both?
      - **36d:** Who in Support verifies job sheets, and should Support get its own role now? Today it has Sales rights (Q34).
37. **Express accounting program (Q37), Gene, 26 Oct 2026:**
    - What we know: Accounting uses Express for the company's books and tax filing. It is licensed (a purchased key).
    - Proposal: Express stays the official books. v2 doesn't replace it, and never writes into its data files. v2 feeds it either by a file Accounting imports, if Express supports that, or by a keying summary.
    - Ask Accounting:
      - Which Express version is it?
      - Is there an import menu? If so, what file format does it take? Is the import a paid add-on to the licence?
      - Do tax invoices and invoices come out of Express today?
      - What does Accounting key into Express for each rental job?
    - The web search found no official Express API documentation. Unconfirmed.
40. **Discounts on Equipment only (Q40), Gene, 27 Oct 2026:** line discounts are allowed on Equipment lines only; any other type is saved at 0 (server rule, `canDiscount` in lib/rules.ts), copies drop them too, and the customer's default discount is applied to Equipment only. logic.js is unchanged, so old-system jobs keep the discounts they had (they are read-only). Open:
    - The order-level **extra discount %** still applies to the whole sub total (logic.js `orderTotals`). Should it apply to Equipment only too? That changes the totals formula, so it waits for Gene's answer.
39. **Store addition (Q39), Gene, 27 Oct 2026:** separate linked job; Store can add at Approve only; no prices until Sales sets them; holds stock at once. Built that way. Open:
    - **Billing, decided by Gene on 27 Oct: each Store addition is its own invoice** (its own Draft INV), as built.
    - Should the main job show its additions' total next to its own?
    - The Cockpit's overbooking check is logic.js's and doesn't count Store Add jobs yet (the stock checks on moves and saves do). Fine while additions are short-lived; say if the Cockpit should count them too.
38. **Quotation PDF in the paper-form layout (Q38), Gene, 27 Oct 2026** (sample: quotation 6902267 rev 016 from the old system; not kept in the repo, it has customer data).
    - **Logo:** `assets/logo.png`, from the logo Gene sent on 27 Oct (stacked JPG, 600×450). The circle and the wordmark were cut apart and set side by side, as on the paper form. A vector (SVG/AI) original would print sharper; `assets/logo.svg` is used if `logo.png` is removed.
    - **Tel / Fax:** company settings have name, address and tax ID only. Put the Tel and Fax lines inside the address (Settings → Company) and they print under it, as on the paper form.
    - **Crew Name / Position:** v2 crew lines are "Position · Person" and split into the two columns. Jobs from the old system keep the rate name only (e.g. "ELECTRICIAN TVC 1500"), so their Position column is empty.
    - **Page 2 of the sample holds only the signature line.** That looks like overflow, so v2 puts the signature right after the remark and lets it move to the next page only if there is no room. Confirm.
    - **Three choices before export (Gene, 27 Oct):** show discount; hide discount (each price is shown after its discount, with no Amount/Disc%/Discount anywhere in the detail, and the same totals); full price (the old "Not Discount" print: list prices and list totals). An order-level extra discount still shows as its own line under Total in every view. Say if it should be folded in too.
    - **Store item list and crew job sheet, PDF (Gene, 27 Oct):** the item list shows everything on the job (items, codes, quantities, days, standby, remarks, crew names) and no prices. The job sheet lists each person (a line with quantity 3 = 3 people) with one row per charged day and blank boxes, filled in by pen: date, time on location, time back, OT hours. No prices. Open: does the paper job sheet need signature lines (crew head, client), and should the dates be pre-printed?
    - **Draft INV** stays HTML. Send a paper sample of each if they should get the same treatment.
    - **Hosting:** the PDF needs Chromium on the server. It works on this Mac now. On Vercel it needs a serverless Chromium package (to be tested at go-live); until then the PDF answers 503 `pdf_unavailable` and the HTML quotation still works.
    - **For 36a, from the sample's remark template:** "1 cue = 12 hours; OT is charged from the 16th minute". The crew OT rates in the sample equal the day rate ÷ 6 (3,000→500, 2,000→334, 1,500→250). Both are what the old system prints, not confirmed rules. Still ask: does the same OT rule apply to crew pay, and how are hours rounded?
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

## 6. M7 job sheet: **approved by Gene 26 Oct 2026** (7a, then 7b with option A: Support enters from the paper sheet). Starts after the Tuesday trial feedback fixes.

From the workflow report (Q36). It is the next block after fixing what staff report at the Tuesday trial. The report's main risk: OT is paid to crew but not billed to the client, because the job sheet comes back late, gets lost or is wrong. Today v2 knows what was **quoted** (cues and OT hours per crew line), but not what **happened**.

**M7a. Support role + handoff from Sales (S)**
- New `support` role. It has Sales' rights (Q34) plus verifying job sheets. In `logic.js` calls it is treated as `sale`, so the spec is unchanged.
- Before Quote → Order, the job must state:
  - the cue length: 12 h, or 16 h;
  - the OT rate on every crew line;
  - any special conditions, in a free-text field.
- **A 16-hour cue needs the CEO's confirmation.** It works the same way as special prices: an admin confirms, and the confirmation lapses if the value changes.
- Pros: small; enforces the report's "standard handoff form"; the 16 h rule is enforced, not remembered.
- Cons: one more required step for Sales.

**M7b. Job sheet record (L)**
- The paper sheet stays the legal original. After the shoot, Support enters from it, for each shoot day:
  - on-location start and end;
  - cues;
  - OT hours for each crew member.
- Support attaches a photo or scan of the signed paper sheet.
- v2 compares this with the quote and shows the difference:
  - extra cues and OT to bill, which goes to Accounting;
  - cues and OT for each person, which goes to HR.
  - Both read the same numbers (report point 4).
- Status: waiting for sheet → entered → sent back to crew to fix → verified. After it is verified, the sheet is locked. Every change is logged.
- KPIs come from the record itself: hours from wrap to sheet received, and the % of sheets sent back.
- Options for who enters the numbers:

  | | Who enters | Pros | Cons |
  | --- | --- | --- | --- |
  | **A (recommended first)** | Support, from the paper sheet | No crew accounts or phone training. Works with the paper the law needs | Support types it in; the sheet still has to come back to the office |
  | B (later) | Crew lead on a phone at the set, and Support checks it against the photo | Numbers arrive the same day | Crew need accounts (LINE login not yet proven, GO-LIVE §7); more training |
- Scans hold client signatures and names. Only admin, support and accounting can see them. They are stored on this Mac during the trial, and in a private Supabase Storage bucket in production.
- Needs answers to 36a (the OT rule) before the comparison can be built. Until then it shows hours only, not baht.

**After M7 (not proposed yet):**
- Invoices and payments: they use verified sheets.
- HR crew summary per pay cycle, staff and freelance separately (36b).
- Return-condition checklist → repairs → damage charge.
- Vehicles: 45–50 of them, so this may matter more than first thought (36c).

