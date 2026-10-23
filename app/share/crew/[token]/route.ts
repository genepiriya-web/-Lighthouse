// The page a client opens from a crew-ID link. No sign-in. GET shows the job and a button only, so chat-app link
// previews (LINE, etc.) never receive personal data and don't use up views. POST (the button) counts a view, logs it and
// shows the list. Expired, revoked or used-up links all show the same "no longer available" page.
import { tx } from "../../../../lib/server/db";
import { openLink } from "../../../../lib/server/crewids";

type Ctx = { params: Promise<{ token: string }> };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff", "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };
const page = (body: string, status = 200) => new Response(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Lighthouse · Crew list</title>
<style>body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:20px 16px;color:#141920;background:#fff;max-width:760px;margin:auto}h1{font-size:20px;margin:0 0 4px}.m{color:#566170;font-size:13px}
table{border-collapse:collapse;width:100%;margin-top:14px;font-size:14px}td,th{border-bottom:1px solid #d2d8df;padding:7px 6px;text-align:left;vertical-align:top}th{font-size:12px;color:#566170}
.id{font-family:ui-monospace,Menlo,monospace;white-space:nowrap}button{font:inherit;background:#F0B323;border:0;border-radius:6px;padding:10px 18px;font-weight:600;margin-top:16px;cursor:pointer}
@media (max-width:520px){table,tr,td{display:block}thead{display:none}tr{border-bottom:1px solid #d2d8df;padding:6px 0}td{border:0;padding:2px 0}}@media print{button{display:none}}</style></head><body>${body}</body></html>`, { status, headers });
const gone = () => page(`<h1>ลิงก์นี้ใช้ไม่ได้แล้ว · This link is no longer available</h1><p class="m">หมดอายุ ถูกยกเลิก หรือเปิดครบจำนวนแล้ว ติดต่อ Lighthouse Film Service เพื่อขอลิงก์ใหม่ · It has expired, been revoked or used up. Ask Lighthouse Film Service for a new one.</p>`, 410);
const head = (j: { no: string; title: string; customer: string }, exp?: string) => `<h1>รายชื่อทีมงาน · Crew list</h1><div class="m">${esc(j.no)} · ${esc(j.title)} · ${esc(j.customer)}</div>${exp ? `<div class="m">ใช้ได้ถึง · Valid until ${esc(new Date(exp).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" }))}</div>` : ""}`;

export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params; const r = await tx(c => openLink(c, token, false));
  if (r.state !== "ok") return gone();
  return page(`${head(r.job!, r.expiresAt)}<p>ข้อมูลนี้มีเลขบัตรประชาชน ใช้เพื่องานนี้เท่านั้น · This list contains national ID numbers. Use it for this job only.</p>
<form method="post"><button type="submit">แสดงรายชื่อ · Show crew list</button></form><p class="m">การเปิดดูแต่ละครั้งถูกบันทึก · Each opening is recorded.</p>`);
}

export async function POST(_req: Request, { params }: Ctx) {
  const { token } = await params; const r = await tx(c => openLink(c, token, true));
  if (r.state !== "ok") return gone();
  const rows = r.crew!.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.position)}</td><td>${esc(x.dates)}</td><td class="id">${esc(x.id) || "—"}</td></tr>`).join("");
  return page(`${head(r.job!, r.expiresAt)}<table><thead><tr><th>ชื่อ · Name</th><th>ตำแหน่ง · Position</th><th>วันที่ · Dates</th><th>เลขบัตรประชาชน · National ID</th></tr></thead><tbody>${rows}</tbody></table>
<p class="m">ใช้เพื่องานนี้เท่านั้น ห้ามส่งต่อ · For this job only. Please don't forward.</p>`);
}
