// Store item list and crew job sheet (no prices) share the header. Quotation in the company's paper-form layout (Gene, 27 Oct 2026; sample: the old system's PDF quotation). Page 1 is the
// summary (7 types, VAT, remark, hirer's signature); then the detail tables per type. Rendered to PDF by lib/server/pdf.ts,
// which adds the "<no>-<rev> (Page x/y)" line on every page.
// Money comes only from logic.js, the same way lib/docs.js shows it, so this form and the HTML quotation always agree.
// Plain CommonJS so node tests can load it, like lib/docs.js.
const L = require("../src/logic.js");
const { sanitizeHtml } = require("./docs.js");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = n => (+n || 0).toFixed(1);
const fmtD = s => { if (!s) return ""; const [y, m, d] = String(s).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const NAMES = { 1: "Equipment", 2: "Accessories", 3: "Expendable", 4: "Transport", 5: "Crews", 6: "Sub-rent", 7: "Freelance" };
const HEADS = { 1: "Equipment", 2: "Accessories", 3: "Expendable", 4: "Transport", 5: "Crew", 6: "Sub-rent", 7: "Freelance" };
const PEOPLE = new Set([5, 7]);

const CSS = `*{box-sizing:border-box}body{margin:0;padding:0 1px;font-family:"Sarabun","Thonburi","Tahoma",Arial,sans-serif;color:#111;font-size:11px}
.sheet{break-after:page}.sheet:last-child{break-after:auto}
.hd{display:flex;align-items:center;gap:24px;padding-bottom:10px;border-bottom:6px solid #a3a3a3}.hd img{height:58px}.hd .logo-text{font-size:26px;font-weight:700;min-width:160px}
.co b{display:block;font-size:19px}.co div{font-size:11px;font-weight:600;white-space:pre-wrap}
.title{display:flex;align-items:center;gap:16px;margin:14px 0 10px}.no{background:#e3e3e3;padding:2px 14px;text-align:center;font-weight:700;font-size:14px;line-height:1.15}
.title h1{font-size:19px;margin:0;flex:1}.when{font-size:11px;font-weight:600;flex:1}.rev{text-align:right;font-size:11px;font-weight:600}
.info{display:flex;background:#f6f5f1;font-size:11px}.info>div{flex:1;padding:6px 10px}.info>div+div{border-left:2px solid #fff}.info p{margin:0 0 5px}.info b{font-weight:700}
table{width:100%;border-collapse:collapse}.sum{margin-top:14px}.sum td,.sum th{border:1px solid #111;padding:3px 4px}.sum th{background:#f6f5f1;font-weight:500}
.r{text-align:right;white-space:nowrap}.c{text-align:center}
.grand{margin:14px 0 0 auto;width:50%;font-weight:700;font-size:12px}.grand td{padding:0 2px;line-height:1.25}
.remark{margin-top:24px}.remark h3{font-size:13px;font-weight:500;margin:0 0 6px}.remark div{font-size:11px;line-height:1.6}.remark p{margin:0}
.sign{margin-top:28px;break-inside:avoid;font-size:11px}
.sec{margin-top:16px;break-inside:auto}.sec.keep{break-inside:avoid}.sec h2{background:#f6f5f1;font-size:13px;margin:0;padding:4px 10px}
.det th{background:#dfe1e3;border:1px solid #111;padding:3px 4px;font-size:11px}.det td{border-left:1px solid #111;border-right:1px solid #111;padding:3px 4px;vertical-align:top}
.det tr:last-child td{border-bottom:1px solid #111}.det tbody tr:nth-child(even) td{background:#f6f5f1}.det tr{break-inside:avoid}.det thead{display:table-header-group}
.child .d{padding-left:14px}.write td{height:30px;border:1px solid #111}.write tbody tr:nth-child(even) td{background:none}.write .blank{min-width:70px}.person{break-inside:avoid}.foot{display:flex;justify-content:flex-end;gap:24px;margin-top:8px;font-size:10px}.foot div{min-width:72px}`;

/** Lines of one type in the order they were entered: each parent row, then its package parts. */
function rowsOf(lines, t) {
  const mine = lines.filter(l => l.t === t), out = [];
  for (const p of mine.filter(l => !l.parent)) { out.push(p); for (const ch of mine) if (ch.parent && ch.parent === p.k) out.push(ch); }
  for (const l of mine) if (!out.includes(l)) out.push(l); // a part whose parent is missing still shows
  return out;
}
/** Crew lines are saved as "Position · Person" (v2) or as the old system's rate name ("ELECTRICIAN TVC 1500"). */
const crewName = l => { const d = String(l.desc ?? ""), i = d.indexOf(" · "); return i < 0 ? { name: d, pos: "" } : { name: d.slice(i + 3), pos: d.slice(0, i) }; };

function header(o, x) {
  const c = x.company || {};
  return `<div class="hd">${x.logo ? `<img src="${esc(x.logo)}" alt="">` : `<div class="logo-text">Lighthouse</div>`}<div class="co"><b>${esc(c.name || "Lighthouse Film Service Co., Ltd.")}</b><div>${esc(c.addr || "")}</div>${c.tax ? `<div>Tax. ${esc(c.tax)}</div>` : ""}</div></div>
<div class="title"><div class="no">NO#:<br>${esc(o.no)}</div><h1>${esc(x.title || "Quotation")}</h1><div class="when">Date ${esc(x.printedAt || "")}<br>Print By : ${esc(x.printedBy || "")}</div><div class="rev">Revision :<br>${esc(String(o.rev || 0).padStart(3, "0"))}</div></div>
<div class="info"><div><p><b>Ref : Order No. ${esc(o.no)}</b></p><p><b>Customer :</b> ${esc([x.customerCode, o.customerName].filter(Boolean).join("-"))}</p><p><b>Billing Address :</b> ${esc(o.billing || "")}</p>
<p><b>Phone :</b> ${esc(o.phone || "")}</p><p><b>Fax :</b> ${esc(o.fax || "")}</p><p><b>Customer Contact :</b> ${esc([o.contact, o.contactPhone].filter(Boolean).join(" "))}</p></div>
<div><p><b>Job Title:</b> ${esc(o.jobTitle || "")}</p><p><b>Ship Date :</b> ${esc(fmtD(o.ship))}</p><p><b>Return Date :</b> ${esc(fmtD(o.ret))}</p><p><b>Usage Start :</b> ${esc(fmtD(o.useStart))} &nbsp; <b>Usage End :</b> ${esc(fmtD(o.useEnd))}</p>
<p><b>Sale Person :</b> ${esc(o.sale || "")}</p><p><b>Job Type :</b> ${esc(o.jobType || "")}</p><p><b>DOP :</b> ${esc(o.dop || "")}</p></div></div>`;
}

/** Totals exactly as lib/docs.js prints them: with discount = logic.js orderTotals; without = list prices + insurance.
 *  The "net" view (discount hidden) has the with-discount totals. */
function money_(lines, o, disc) {
  const G = L.orderTotals(lines, o);
  if (disc) return { G, sub: G.sub, extra: G.extra, adj: G.adj, ins: G.ins, vat: G.vat, total: G.total };
  const base = G.list + G.ins; const vat = o.tax === "Not Vat" ? 0 : Math.round(base * 7) / 100;
  return { G, sub: G.list, extra: 0, adj: 0, ins: G.ins, vat, total: Math.round((base + vat) * 100) / 100 };
}
const typeSum = (lines, t, disc) => { const T = L.typeTotals(lines, t); return disc ? T.sub : T.list; };

function grand(M, o) {
  const row = (k, v) => `<tr><td>${k}</td><td class="r">${v} Baht</td></tr>`;
  return `<table class="grand">${row("Total", money(M.sub))}${M.extra ? row("Extra Discount", "-" + money(M.extra)) : ""}${M.adj ? row("Adjustment", money(M.adj)) : ""}${M.ins ? row("Insurance Fee", money(M.ins)) : ""}${o.tax === "Not Vat" ? "" : row("Vat Value (7%)", money(M.vat))}${row("Grand Total (Inc.Vat)", money(M.total))}</table>`;
}

/** Unit price after the line's discount, for the "net" view: what the customer pays per unit, with no discount shown. */
const netOf = (v, l) => L.r2((+v || 0) * (1 - Math.max(0, Math.min(100, +l.disc || 0)) / 100));

function itemTable(lines, t, view) {
  const rows = rowsOf(lines, t); const T = L.typeTotals(lines, t); const disc = view !== "list", net = view === "net";
  const showDisc = view === "disc" && (t !== 4 || rows.some(l => +l.disc > 0)); // the paper form's Transport table has no discount columns
  let n = 0, h = `<table class="det"><thead><tr><th>NO.</th><th>Description</th><th>${net ? "Price" : "List Price"}</th><th>QTY</th><th>Days</th>${showDisc ? "<th>Amount</th><th>Disc%</th>" : ""}<th>Total</th><th>Remark</th></tr></thead><tbody>`;
  for (const l of rows) {
    const k = L.lineCalc(l), free = l.sb || l.foc, tag = l.sb ? "Stand By" : "FOC";
    const note = [free ? `${l.sb ? "StandBy" : "FOC"} : ${+l.qty || 0}<br>Price : ${esc(money(net ? netOf(l.list, l) : l.list))}` : "", esc(l.remark || "")].filter(Boolean).join("<br>");
    h += `<tr class="${l.parent ? "child" : ""}"><td class="c">${l.parent ? "" : ++n}</td><td class="d">${esc(l.desc)}</td><td class="r">${free ? tag : money(net ? netOf(l.list, l) : l.list)}</td><td class="c">${n1(l.qty)}</td><td class="c">${n1(l.days)}</td>`
      + (showDisc ? `<td class="r">${free ? "-" : money(k.amount)}</td><td class="r">${free ? "-" : money(l.disc)}</td>` : "")
      + `<td class="r">${free ? "-" : money(disc ? k.total : k.amount)}</td><td class="c">${note}</td></tr>`;
  }
  const foot = net ? [["Total:", T.sub]] : showDisc ? [["Amount:", T.list], ["Discount:", T.disc], ["Total:", T.sub]] : [["Amount:", T.list], ["Total:", disc ? T.sub : T.list]];
  return h + `</tbody></table><div class="foot">${foot.map(([k, v], i) => `<div>${k}<br>${money(v)}${i === foot.length - 1 ? " Baht" : ""}</div>`).join("")}</div>`;
}

function crewTable(lines, t, view) {
  const rows = rowsOf(lines, t); const T = L.typeTotals(lines, t); const disc = view !== "list", net = view === "net";
  const showDisc = view === "disc" && rows.some(l => +l.disc > 0);
  let price = 0, ot = 0, n = 0;
  let h = `<table class="det"><thead><tr><th>NO.</th><th>Name</th><th>Position</th><th>QTY</th><th>${net ? "Price" : "List Price"}</th><th>Days</th><th>OT</th><th>hr.</th>${showDisc ? "<th>Disc%</th>" : ""}<th>Total</th><th>Remark</th></tr></thead><tbody>`;
  for (const l of rows) {
    const k = L.lineCalc(l), free = l.sb || l.foc, who = crewName(l);
    const list = net ? netOf(l.list, l) : +l.list || 0, otRate = net ? netOf(l.otRate, l) : +l.otRate || 0;
    if (!free) { price += list * (+l.qty || 0) * (+l.days || 0); ot += otRate * (+l.ot || 0) * (+l.qty || 0); }
    h += `<tr><td class="c">${++n}</td><td>${esc(who.name)}</td><td class="c">${esc(who.pos)}</td><td class="c">${n1(l.qty)}</td><td class="r">${free ? (l.sb ? "Stand By" : "FOC") : money(list)}</td><td class="c">${n1(l.days)}</td>`
      + `<td class="r">${money(otRate)}</td><td class="c">${n1(l.ot)}</td>${showDisc ? `<td class="r">${free ? "-" : money(l.disc)}</td>` : ""}<td class="r">${free ? "-" : money(disc ? k.total : k.amount)}</td><td class="c">${esc(l.remark || "")}</td></tr>`;
  }
  const foot = [["Crew Price", price], ["Ot Total", ot], ...(showDisc ? [["Discount", T.disc]] : []), ["Total:", disc ? T.sub : T.list]];
  return h + `</tbody></table><div class="foot">${foot.map(([k, v], i) => `<div>${k}<br>${money(v)}${i === foot.length - 1 ? " Baht" : ""}</div>`).join("")}</div>`;
}

/** order: as lib/docs.js (plus fax). view: "disc" (discount shown), "net" (discount hidden: net prices, same totals; Gene,
 *  27 Oct) or "list" (full list prices, the old "Not Discount" print); true/false mean disc/list.
 *  x: { company, remarks, footers, printedAt "dd/mm/yyyy hh:mm:ss", printedBy, customerCode, logo (data: URL) }. */
function quoteForm(o, lines, view, x = {}) {
  view = view === true ? "disc" : view === false ? "list" : view; const disc = view !== "list";
  const M = money_(lines, o, disc);
  const rem = (x.remarks || []).find(r => String(r.id) === String(o.remarkId)); const ft = (x.footers || []).find(r => String(r.id) === String(o.footerId));
  let h = `<section class="sheet">${header(o, x)}<table class="sum"><thead><tr><th style="width:5%">NO</th><th>Type</th><th style="width:22%">Total</th></tr></thead><tbody>`
    + L.TYPES.map((ty, i) => `<tr><td class="c">${i + 1}</td><td>${NAMES[ty.id]}</td><td class="r">${money(typeSum(lines, ty.id, disc))}</td></tr>`).join("")
    + `</tbody></table>${grand(M, o)}`;
  if (rem || ft) h += `<div class="remark"><h3>Remark :</h3>${rem ? `<div>${sanitizeHtml(rem.html)}</div>` : ""}${ft ? `<div>${sanitizeHtml(ft.html)}</div>` : ""}</div>`;
  h += `<div class="sign">Approval Signature/Hirer ______________________________________ Date ______________________________</div></section>`;
  const used = L.TYPES.filter(ty => lines.some(l => l.t === ty.id));
  if (used.length) {
    h += `<section class="sheet">${header(o, x)}`;
    for (const ty of used) h += `<div class="sec${lines.filter(l => l.t === ty.id).length <= 12 ? " keep" : ""}"><h2>${HEADS[ty.id]}</h2>${PEOPLE.has(ty.id) ? crewTable(lines, ty.id, view) : itemTable(lines, ty.id, view)}</div>`;
    h += `${grand(M, o)}</section>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.no)}</title><style>${CSS}</style></head><body>${h}</body></html>`;
}

const VIEWS = ["disc", "net", "list"];
/** Store's item list (Gene, 27 Oct): everything on the job — items, quantities, days, standby, remarks, crew names —
 *  but no prices anywhere. */
function itemSheet(o, lines, x = {}) {
  let h = `<section class="sheet">${header(o, { ...x, title: "Item List" })}`;
  for (const ty of L.TYPES.filter(ty => lines.some(l => l.t === ty.id))) {
    const rows = rowsOf(lines, ty.id), crew = PEOPLE.has(ty.id); let n = 0;
    h += `<div class="sec${rows.length <= 12 ? " keep" : ""}"><h2>${HEADS[ty.id]}</h2><table class="det"><thead><tr><th>NO.</th>${crew ? "<th>Name</th><th>Position</th>" : "<th>Code</th><th>Description</th>"}<th>QTY</th><th>Days</th><th>Remark</th></tr></thead><tbody>`;
    for (const l of rows) { const who = crewName(l); const note = [l.sb ? "Stand By" : l.foc ? "FOC" : "", esc(l.remark || "")].filter(Boolean).join("<br>");
      h += `<tr class="${l.parent ? "child" : ""}"><td class="c">${l.parent ? "" : ++n}</td>${crew ? `<td>${esc(who.name)}</td><td class="c">${esc(who.pos)}</td>` : `<td>${esc(l.code || "")}</td><td class="d">${esc(l.desc)}</td>`}<td class="c">${n1(l.qty)}</td><td class="c">${n1(l.days)}</td><td class="c">${note}</td></tr>`; }
    h += `</tbody></table></div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.no)}</title><style>${CSS}</style></head><body>${h}</section></body></html>`;
}

/** Crew job sheet (Gene, 27 Oct): printed and filled in by pen on location. One row per person per charged day, with
 *  boxes for the date, time on location, time back and OT hours. No prices. The signed paper stays the record (Q36). */
function jobSheet(o, lines, x = {}) {
  const crew = lines.filter(l => PEOPLE.has(l.t) && !l.parent);
  let h = `<section class="sheet">${header(o, { ...x, title: "Job Sheet" })}<div class="sec"><h2>Crew</h2><table class="det write"><thead><tr><th>NO.</th><th>Name</th><th>Position</th><th>Date</th><th>On Location</th><th>Return</th><th>OT (hr.)</th></tr></thead>`;
  let n = 0;
  for (const l of crew) for (let p = 0; p < Math.max(1, Math.ceil(+l.qty || 0)); p++) {
    const who = crewName(l), days = Math.max(1, Math.ceil(+l.days || 0));
    h += `<tbody class="person">`;
    for (let d = 0; d < days; d++) h += `<tr>${d ? "" : `<td class="c" rowspan="${days}">${++n}</td><td rowspan="${days}">${esc(who.name)}${l.t === 7 ? " (Freelance)" : ""}</td><td class="c" rowspan="${days}">${esc(who.pos)}</td>`}<td class="blank">&nbsp;</td><td class="c">____ : ____</td><td class="c">____ : ____</td><td class="blank">&nbsp;</td></tr>`;
    h += `</tbody>`;
  }
  if (!n) h += `<tbody><tr><td colspan="7" class="c">—</td></tr></tbody>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.no)}</title><style>${CSS}</style></head><body>${h}</table></div></section></body></html>`;
}

const pdfName = (o, view, kind = "quote") => { view = view === true ? "disc" : view === false ? "list" : view;
  if (kind !== "quote") return `${o.no}-${String(o.rev || 0).padStart(3, "0")}-${kind === "items" ? "item-list" : "job-sheet"}.pdf`;
  return `${o.no}-${String(o.rev || 0).padStart(3, "0")}-quotation${view === "net" ? "-net" : view === "list" ? "-nodisc" : ""}.pdf`; };

module.exports = { VIEWS, quoteForm, itemSheet, jobSheet, pdfName, crewName, rowsOf };
