# Go-live checklist (M6)

Everything below that involves a password, a database connection string or a secret key is done by **Gene** (or someone he trusts) in his own terminal or the providers' dashboards — never pasted into chat or committed (CLAUDE.md rule 1). Claude can prepare commands and check results.

Status: code for sign-in, invites, backups and restore is built and tested locally (`npm run test:auth`, `npm run test:backup`; restore tested on the full local copy of the real data — every table identical). Nothing below has been done on a real Supabase project yet.

## 1. Supabase project — Gene
1. Create a project in the **Singapore** region (see PLAN.md Q11 on PDPA cross-border transfer — confirm with counsel).
2. **Authentication → Sign In / Providers → Email**: keep enabled. In **Email templates**, make the sign-in email include the 6-digit code (`{{ .Token }}`) so staff can type it on their phone — check Supabase's "Email OTP" guide while doing this.
3. **Google** provider (optional, needs a Google Cloud OAuth client): add client ID/secret in the dashboard.
4. **JWT signing keys**: prefer the asymmetric (ES256/RS256) keys. The app verifies those locally; legacy HS256 projects still work but every token is checked with Supabase over the network.
5. **URL configuration**: set the Site URL and redirect URLs to the production domain.

Tell Claude (safe to share): the project URL (`https://<ref>.supabase.co`) and the **publishable** key. Do **not** share the database password, connection string or secret/service keys.

## 2. Keys — Gene
Generate two separate keys in your own terminal and store each in a password manager **and** an offline copy:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
- `CREW_ID_KEY` — encrypts crew national IDs. Lost key = re-import the IDs.
- `BACKUP_KEY` — encrypts backups. Lost key = backups can't be opened.
- Optional, `DISCORD_WEBHOOK_URL`: bug reports announced in a Discord channel. In Discord, open Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Treat it like a password: anyone who has it can post in that channel. Set it in Vercel (and in `.env.local` for the trial). Set `LHD_PUBLIC_URL` to the app's address so the message links back.

## 3. Database — Gene runs, Claude checks the output
In your terminal, with `DATABASE_URL` set to the Supabase connection string (session mode, port 5432):
```bash
npm run db:migrate
```
Then, in the Supabase SQL editor, check the app's database user may act as `service_role` (the server relies on it):
```sql
select pg_has_role(current_user, 'service_role', 'member');
```
If this is `false`, stop and tell Claude — the server's connection setup needs changing before go-live (unverified assumption until checked).

Load the data (a fresh artifact export taken on cutover day, into `data/export/` on your machine):
```bash
npm run db:import
DATABASE_URL=… node scripts/invite.js <your-email> admin "Gene"
```

## 4. Vercel — Gene
Project region **sin1** (Singapore). Environment variables (Production):
| Name | Value |
| --- | --- |
| `DATABASE_URL` | Supabase connection string (transaction pooler) |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | publishable key |
| `CREW_ID_KEY` | from step 2 |

Quotation PDF: the server draws it with Chromium (`playwright-core`). Vercel has no Chromium, so before go-live test a serverless Chromium package there; until then the PDF button answers 503 `pdf_unavailable` and the HTML quotation still works (PLAN Q38).

**Never set `LHD_AUTH`** in production (the test sign-in also refuses to run against a non-local database).

## 5. Backups — Gene
1. Put the code in a private GitHub repository.
2. Repository secrets: `DATABASE_URL`, `BACKUP_KEY`.
3. Run the **backup** workflow by hand once: it backs up, restores into a throwaway Postgres and compares every table. That's the go-live restore test on real production data.
4. Supabase's own daily backups are on paid plans — check the plan (flaw 3, layer 1).

## 6. First sign-in and staff
1. Sign in at `/signin` with your invited email → you're admin.
2. **Team → Invites**: invite each person with their role.
3. **Crew rates → Import national IDs**: import the crew IDs from your own file (they were not copied out of the artifact).

## 7. LINE Login (spike, 1 day) — not built
Facts checked: LINE web-login ID tokens are signed **HS256** with the channel secret ([LINE docs](https://developers.line.biz/en/docs/line-login/verify-id-token/)); Supabase custom **OIDC** providers verify ID tokens against a published key list, which HS256 tokens don't have. So OIDC mode will most likely fail for web login. To try: Supabase **custom OAuth2** provider (authorization, token and userinfo endpoints) with LINE's userinfo endpoint. Second hurdle: LINE only shares the user's email after LINE approves the email permission for the channel, and invites match on email. Start with email code / Google; add LINE if the spike works.

## 8. Pilot — one salesperson, new jobs only, one week
- Old system stays the place for every existing job (they're read-only in v2).
- Each morning: run `npm run db:import` with a fresh export (or keep the artifact sync) so stock clash checks see old-system bookings.
- Daily check: Cockpit, the backup workflow's result, and any 500 errors in Vercel logs.
- Stop rule: any wrong total, lost edit or stock clash missed → back to the old system for new jobs (nothing in the old system was changed), fix, retry.
