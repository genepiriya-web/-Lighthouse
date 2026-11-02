# Old system — what we know (read-only)

**Rule: v2 never writes to the old system.** Reads only, through a person's own logged-in browser session. No passwords or tokens are stored anywhere in this repo.

## Known facts
| Item | Value | Source |
| --- | --- | --- |
| Web app | admin.lighthouse.co.th (Next.js front end) | Design review doc, 23 Oct 2026 |
| API host | api-admin.lighthouse.co.th | Design review doc |
| Open-job list | `POST /order/search` by named status, 50 per page (see below) | Read 28 Oct 2026 |
| Change detection | `updatedDate` per order | Design review doc |
| Item types | 1 Equipment, 2 Accessories, 3 Expendable, 4 Transport, 5 Crew, 6 Subrent, 7 Freelance | `src/logic.js` |
| Departments | 1 Lighting, 2 Grip, 3 Grip & Lighting | `src/app.html` |
| Order number | 2-digit Buddhist year + 5-digit sequence (e.g. 6902255). v2 starts at 6909001 | Design review doc |
| Data copied so far | 3,275 products, 1,247 customers, 784 crew (2,582 rate rows), 106 positions, 8 remark/footer templates, 197 open jobs (sync of 23 Oct 2026) | Design review doc |

## How sync works today (since 28 Oct 2026: steps saved in `scripts/sync/`)
Read only, through a person's own logged-in tab on admin.lighthouse.co.th (Claude runs it in the desktop app's browser).
1. `npm run sync:recheck` → the old-system ids of every job open in `data/export`.
2. In the logged-in tab, run `scripts/sync/pull.browser.js`, then `window.__lhdPull(<those ids>)`. It uses the old app's own HTTP
   client (so the app adds its own login — no password or token is ever read) and only these read endpoints:
   - `POST /order/search` — `status` named (Order, Approve, Shipped, Returned, Quote); an empty status returns quotes only.
     Quotes kept only when they ship from 30 days ago on (the old system holds ~650 quotes).
   - `POST /orderProduct/findByOrderIdAndProductTypeId` (`orderId`, `productTypeId` 1,2,3,4,6) — item lines, package parts in
     `productWrapper.orderProductChildWrappers`.
   - `POST /orderCrew/search` (`orderId`, `crewTypeId` 5 crew, 7 freelance) — crew lines.
   - `POST /order/getByOrderId` (`orderId`) — status of jobs that left the open list.
   Every open job is read in full each time: line edits don't change a job's `updatedDate`.
3. When `window.__lhdProgress.downloaded` is set, the browser has downloaded `lighthouse-sync-<run>.json` (~1.4 MB). The
   person approves each download. Move it to `data/sync/` (git-ignored). The browser pane blocks pages from posting to this
   Mac, so a download is the hand-over.
4. `npm run backup`, then `npm run sync:convert -- data/sync/lighthouse-sync-<run>.json` (writes `data/export`), then
   `npm run db:import`. Old-system jobs only; v2 jobs are never touched. Safe to run twice.
5. To check a run before importing: convert into a copy of `data/export` and compare jobs whose `updatedAt` didn't change
   (28 Oct: 144 of 146 identical; the other 2 were real line edits the old system made without changing the date).

Run of 28 Oct 2026, 11:00: 207 open jobs (33 new since 23 Oct), 23 re-checked after leaving the open list, 242 old-system
jobs in v2 after import.

## History pull (3 Nov 2026, `scripts/sync/history.browser.js`)
Every job of every status, once (Gene: "Everything", 10,154 jobs). Same read endpoints as the sync, minus getByOrderId.
1. In the logged-in tab, run the file, then `window.__lhdHist()`. It lists every job (`/order/search` by each status, plus
   empty status for the Q-numbered quotes), then reads each job's items and crew, one job at a time (~2.5 s a job, ~7 h).
   Each finished job is kept in the tab's IndexedDB (`lhd-history`), so after a reload or a new sign-in, run it again and it
   carries on. Pause: `window.__lhdHistPause = true`.
2. It downloads nothing by itself. `await window.__lhdHistSave(<part>)` downloads part 1–6 (2,000 jobs each, oldest first,
   ~14 MB) as `lighthouse-history-<run>-<p>of6.json`; the person OKs each download. Move them to `data/sync/`.
3. `npm run backup`, then `npm run sync:convert -- data/sync/lighthouse-history-*.json` (one run, all parts), then a normal
   sync (open jobs may have moved on during the pull), then `npm run db:import`.
4. `window.__lhdHistClear()` when done, so no copy stays in the browser.

## Unknown — ask before relying on it
- Who owns the old system's code and database? Is a read-only API key or DB replica possible?
- Whether the old system's terms or contract allow automated reading.
