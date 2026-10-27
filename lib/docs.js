// Quotation / Draft INV / Item list as HTML — a port of the artifact page's docBody() (src/app.html), kept line for line
// so the printouts look and add up the same. Used by the server (download) and the job sheet (preview).
// Plain CommonJS so node tests can load it, like src/logic.js.
const L = require("../src/logic.js");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = s => { if (!s) return ""; const [y, m, d] = String(s).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const DEPT = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };

/* Templates came from the old system as HTML. Keep only basic text tags, with no attributes; everything else becomes
   escaped text. Same allow-list as the artifact's sanitizeHtml(), but without a DOM so it also runs on the server. */
const OK_TAGS = new Set(["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "span", "div"]);
function sanitizeHtml(html) {
  const src = String(html ?? ""); let out = ""; let i = 0;
  const text = s => s.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g; let m;
  while ((m = re.exec(src))) {
    out += text(src.slice(i, m.index)); i = re.lastIndex;
    if (!m[1]) continue; // comment
    const tag = m[1].toLowerCase(); if (!OK_TAGS.has(tag)) continue; // drop the tag, keep the text around it
    out += m[0][1] === "/" ? (tag === "br" ? "" : `</${tag}>`) : `<${tag}>`;
  }
  return out + text(src.slice(i));
}

/** order: camelCase job (customerName, jobTitle, billing, phone, contact, contactPhone, jobType, dept, ship, ret, useStart,
 *  useEnd, dop, sale, no, rev, tax, extraDisc, insurance, adjust, remarkId, footerId). kind: quote | draft | items. */
function docBody(o, lines, kind, disc, { company = {}, remarks = [], footers = [], today } = {}) {
  const G = L.orderTotals(lines, o); const title = kind === "quote" ? "QUOTATION / ใบเสนอราคา" : kind === "draft" ? "DRAFT INVOICE" : "ITEM LIST";
  const c = company || {}; const rem = (remarks || []).find(r => String(r.id) === String(o.remarkId)); const ft = (footers || []).find(r => String(r.id) === String(o.footerId));
  const th = 'style="text-align:left;border-bottom:1px solid #999;padding:4px 6px;font-size:11px"', td = 'style="padding:3px 6px;border-bottom:1px solid #eee;font-size:12px;vertical-align:top"', tdr = 'style="padding:3px 6px;border-bottom:1px solid #eee;font-size:12px;text-align:right;white-space:nowrap"';
  let h = `<div style="font-family:'IBM Plex Sans Thai',Arial,sans-serif;color:#111;min-width:640px"><div style="display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #111;padding-bottom:8px"><div><div style="font-size:20px;font-weight:700;letter-spacing:.06em">${esc(c.name || "Lighthouse Film Service")}</div><div style="font-size:11px;white-space:pre-wrap">${esc(c.addr || "")}</div>${c.tax ? `<div style="font-size:11px">Tax ID ${esc(c.tax)}</div>` : ""}</div><div style="text-align:right"><div style="font-size:16px;font-weight:700">${esc(title)}</div><div style="font-size:12px">No. ${esc(o.no)} · Rev ${esc(String(o.rev || 0).padStart(3, "0"))}</div><div style="font-size:12px">Date ${esc(fmtD(today))}</div></div></div>
  <table style="width:100%;margin:10px 0;font-size:12px;border-collapse:collapse"><tr><td style="width:50%;vertical-align:top"><b>${esc(o.customerName)}</b><br>${esc(o.billing || "")}<br>${o.phone ? "Tel " + esc(o.phone) : ""}${o.contact ? `<br>Attn: ${esc(o.contact)} ${esc(o.contactPhone || "")}` : ""}</td><td style="vertical-align:top">Job: <b>${esc(o.jobTitle)}</b><br>Job type: ${esc(o.jobType || "")} · ${esc(DEPT[o.dept] || "")}<br>Ship ${esc(fmtD(o.ship))} · Return ${esc(fmtD(o.ret))}<br>Usage ${esc(fmtD(o.useStart))} – ${esc(fmtD(o.useEnd))}<br>DOP ${esc(o.dop || "")} · Sales ${esc(o.sale || "")}</td></tr></table>`;
  for (const ty of L.TYPES) { const rows = lines.filter(l => l.t === ty.id); if (!rows.length) continue; const T = L.typeTotals(lines, ty.id);
    h += `<div style="font-weight:700;margin-top:10px;font-size:13px">${esc(ty.k)}</div><table style="width:100%;border-collapse:collapse"><thead><tr><th ${th}>Code</th><th ${th}>Description</th>${kind === "items" ? `<th ${th}>Qty</th>` : `<th ${th}>Price</th><th ${th}>Qty</th><th ${th}>Days</th>${disc ? `<th ${th}>Amount</th><th ${th}>Disc%</th>` : ""}<th ${th}>Total</th>`}</tr></thead><tbody>`;
    for (const l of rows) { const k = L.lineCalc(l); const child = !!l.parent; const free = child && !k.amount;
      h += kind === "items" ? `<tr><td ${td}>${esc(l.code)}</td><td ${td}>${child ? "&nbsp;&nbsp;– " : ""}${esc(l.desc)}</td><td ${tdr}>${+l.qty || 0}</td></tr>`
        : `<tr><td ${td}>${esc(l.code)}</td><td ${td}>${child ? "&nbsp;&nbsp;– " : ""}${esc(l.desc)}${l.foc ? " (FOC)" : ""}${l.sb ? " (Standby)" : ""}</td><td ${tdr}>${free ? "-" : money(l.list)}</td><td ${tdr}>${+l.qty || 0}</td><td ${tdr}>${+l.days || 0}</td>${disc ? `<td ${tdr}>${free ? "-" : money(k.amount)}</td><td ${tdr}>${free || !+l.disc ? "-" : money(l.disc)}</td>` : ""}<td ${tdr}>${free ? "-" : money(disc ? k.total : k.amount)}</td></tr>`; }
    if (kind !== "items") h += `<tr><td colspan="${disc ? 7 : 5}" ${tdr}>${disc ? `List ${money(T.list)} · Discount ${money(T.disc)} · ` : ""}<b>Sub total ${money(disc ? T.sub : T.list)}</b></td></tr>`;
    h += `</tbody></table>`; }
  if (kind !== "items") { const sub = disc ? G.sub : G.list; const extra = disc ? G.extra : 0; const base = sub - extra + (disc ? G.adj : 0) + G.ins; const vat = o.tax === "Not Vat" ? 0 : Math.round(base * 7) / 100; const tot = Math.round((base + vat) * 100) / 100;
    const showSame = disc; // with discount: exact totals; without: list-price view as in the old "Not Discount" print
    h += `<table style="margin-left:auto;margin-top:10px;font-size:12px;border-collapse:collapse;min-width:280px">${disc ? `<tr><td ${td}>List</td><td ${tdr}>${money(G.list)}</td></tr><tr><td ${td}>Discount</td><td ${tdr}>${money(G.disc)}</td></tr>` : ""}<tr><td ${td}>Sub total</td><td ${tdr}>${money(sub)}</td></tr>${extra ? `<tr><td ${td}>Extra discount</td><td ${tdr}>-${money(extra)}</td></tr>` : ""}${disc && G.adj ? `<tr><td ${td}>Adjustment</td><td ${tdr}>${money(G.adj)}</td></tr>` : ""}${G.ins ? `<tr><td ${td}>Insurance fee</td><td ${tdr}>${money(G.ins)}</td></tr>` : ""}<tr><td ${td}>VAT 7%</td><td ${tdr}>${money(showSame ? G.vat : vat)}</td></tr><tr><td ${td}><b>Total</b></td><td ${tdr}><b>${money(showSame ? G.total : tot)}</b></td></tr></table>`;
    if (rem) h += `<div style="margin-top:14px;font-size:11px;border-top:1px solid #ccc;padding-top:6px">${sanitizeHtml(rem.html)}</div>`;
    if (ft) h += `<div style="margin-top:6px;font-size:11px">${sanitizeHtml(ft.html)}</div>`;
    h += `<div style="display:flex;justify-content:space-between;gap:30px;margin-top:40px;font-size:12px"><div style="flex:1;border-top:1px solid #111;text-align:center;padding-top:4px">Customer</div><div style="flex:1;border-top:1px solid #111;text-align:center;padding-top:4px">${esc(c.name || "Lighthouse Film Service")}</div></div>`; }
  return h + `</div>`;
}

/** The whole downloadable file, as the artifact saved it. */
function docFile(o, lines, kind, disc, ctx) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.no)}</title><style>@page{size:A4;margin:12mm}body{margin:0;padding:16px}</style></head><body>${docBody(o, lines, kind, disc, ctx)}</body></html>`;
}
const docName = (o, kind, disc) => `${o.no}-${kind === "quote" ? "quotation" : kind === "draft" ? "draft-inv" : "item-list"}${kind !== "items" && !disc ? "-nodisc" : ""}.html`;

/** DB row (snake_case) → the camelCase shape docBody expects. */
const fromRow = r => ({ no: r.no, rev: r.rev, customerName: r.customer_name, billing: r.billing, phone: r.phone, fax: r.fax, contact: r.contact, contactPhone: r.contact_phone,
  jobTitle: r.job_title, jobType: r.job_type, dept: r.dept, ship: r.ship, ret: r.ret, useStart: r.use_start, useEnd: r.use_end, dop: r.dop, sale: r.sale,
  tax: r.tax, extraDisc: r.extra_disc, insurance: r.insurance, adjust: r.adjust, remarkId: r.remark_id, footerId: r.footer_id });

module.exports = { sanitizeHtml, docBody, docFile, docName, fromRow };
