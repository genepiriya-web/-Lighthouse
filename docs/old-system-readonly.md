# Old system — what we know (read-only)

**Rule: v2 never writes to the old system.** Reads only, through a person's own logged-in browser session. No passwords or tokens are stored anywhere in this repo.

## Known facts
| Item | Value | Source |
| --- | --- | --- |
| Web app | admin.lighthouse.co.th (Next.js front end) | Design review doc, 23 Oct 2026 |
| API host | api-admin.lighthouse.co.th | Design review doc |
| Open-job list | `POST /order/search`, fetched as one large page because paging was unreliable | Design review doc |
| Change detection | `updatedDate` per order | Design review doc |
| Item types | 1 Equipment, 2 Accessories, 3 Expendable, 4 Transport, 5 Crew, 6 Subrent, 7 Freelance | `src/logic.js` |
| Departments | 1 Lighting, 2 Grip, 3 Grip & Lighting | `src/app.html` |
| Order number | 2-digit Buddhist year + 5-digit sequence (e.g. 6902255). v2 starts at 6909001 | Design review doc |
| Data copied so far | 3,275 products, 1,247 customers, 784 crew (2,582 rate rows), 106 positions, 8 remark/footer templates, 197 open jobs (sync of 23 Oct 2026) | Design review doc |

## How sync works today
Claude, in the desktop app's browser on Gene's Mac, logged in as Gene, triggered by hand:
1. Fetch open jobs (`POST /order/search`).
2. Compare `updatedDate`; fetch details, items of every type and crew for changed jobs only.
3. For jobs that left the open list, re-check status (Draft INV / Cancel).
4. Convert to v2 `orders`/`lines`, recompute totals, add auto-adjust, overwrite v2's copy, stamp `meta/sync`.

## Unknown — ask before relying on it
- Who owns the old system's code and database? Is a read-only API key or DB replica possible?
- The full list of read endpoints and their fields. Not documented here because the sync scripts are not in this repo.
- Whether the old system's terms or contract allow automated reading.
