// Converts one read-only pull of the old system (scripts/sync/pull.browser.js → a JSON file) into the export format the
// importer reads (data/export/orders/*.json, data/export/lines/*.json, data/export/meta/sync.json), the same shape as the
// 23 Oct 2026 sync. Master data in data/export (catalog, customers, crew, kits, meta/config) is left as it is.
//   node scripts/sync/convert.js <pull.json> [exportDir=data/export]
// Then: npm run backup && npm run db:import
// Mapping, checked against the 23 Oct copy of job 6902202 (old id 18471):
//   order: orderId (a leading "Q" marks a Quote and stays in the number: see below) · status (null on quotes) · header fields · old totals kept as legacyTotals
//   item line: k "L<id>", discount % as the old system stored it, package parts "<k>c<n>" from orderProductChildWrappers
//   crew line: k "C<id>", "<position> · <name>" as the description, OT hours and rate, the old line total as legacyAmount
//   out/in: the old system's lists don't carry counts; Shipped means all out, Returned/Draft INV all back (as on 23 Oct)
// Jobs that were open last time and have left the open list get their status from getByOrderId ("detail").
// Job numbers (history pull, 3 Nov 2026): the old system's Q-numbered quotes (status null) are their own series, and 136 of
// the 137 reuse a real job's number (Q6700001 and 6700001 are different jobs), so the Q stays. One number was given to two
// jobs at once (6701680, old ids 11473 and 11474, 0.3 s apart): a job whose number is already taken by another old id
// gets "<number>-<old id>". Never two jobs in one file.
// adjust (docs/PLAN.md L8, as the 23 Oct import): when v2's sub total differs from the old one by at most
// max(฿1,000, 2%), the difference becomes the job's adjust and is listed in meta/sync.json for review; a bigger gap is
// left as it is, so the Cockpit shows the job's totals disagree. Never on a job with store-added lines whose v2 total is
// higher: the old system doesn't redo a job's totals when Store adds lines, until someone saves the job again (2 Nov 2026
// sync: 6902320, 6902318, 6902312, 6902281 each missed exactly their newest "Store Add" lines), so there the lines are
// right and the old total is stale (PLAN Q43). Those are listed as storeAddGap.
const fs = require("fs"), path = require("path");
const L = require("../../src/logic.js");

const day = s => (s ? String(s).slice(0, 10) : "");
const n = v => (v == null || v === "" || isNaN(+v) ? 0 : +v);
const STATUS = { Quote: "Quote", Order: "Order", Approve: "Approve", Shipped: "Shipped", Returned: "Returned", "Draft INV": "Draft INV", Cancel: "Cancel" };
const statusOf = o => { const s = o.status == null ? (String(o.orderId ?? "").startsWith("Q") ? "Quote" : null) : STATUS[o.status] ?? STATUS[String(o.status).trim()] ?? null;
  if (!s) throw new Error(`unknown status ${JSON.stringify(o.status)} on ${o.orderId}`); return s; };
const noOf = o => String(o.orderId ?? "");
/** The v2 number for old job `o`: its own number, or "<number>-<old id>" when another old job already has that number. */
function fileNo(o, od) {
  const no = noOf(o), f = path.join(od, `${no}.json`);
  if (!fs.existsSync(f)) return no;
  const other = JSON.parse(fs.readFileSync(f, "utf8")).legacyId;
  return other == null || String(other) === String(o.id) ? no : `${no}-${o.id}`;
}

function orderOf(o, prev, no = noOf(o)) {
  const status = statusOf(o);
  return {
    id: no, no, legacyId: o.id, status, customerId: o.customerId ?? null, customerName: o.customerName ?? "", jobTitle: o.jobTitle ?? "", jobType: o.jobType ?? "",
    dept: o.departmentId ?? null, billing: o.billingAddress ?? "", phone: o.phoneNo ?? "", fax: o.faxNo ?? "", contact: o.customerContact ?? "", contactPhone: o.customerContactPhoneNo ?? "",
    dop: o.dop ?? "", pm: o.productManage ?? "", gaffer: o.gaffer ?? "", keyGrip: o.keyGrip ?? "", note: o.remark ?? "", sale: o.salePersonName ?? "",
    rentType: o.type === "Weekly" ? "Weekly" : "Daily", dpw: n(o.dpw), tax: o.tax === "Not Vat" ? "Not Vat" : "Vat",
    ship: day(o.shipDate), ret: day(o.returnDate), useStart: day(o.usageStart), useEnd: day(o.usageEnd),
    footerId: o.footerId == null ? "" : String(o.footerId), remarkId: o.remarkId == null ? "" : String(o.remarkId),
    extraDisc: n(o.discountPercent), insurance: n(o.insuranceFree), adjust: 0,
    legacyTotals: { list: n(o.listPrice), disc: n(o.discount), sub: n(o.subTotal), vat: n(o.vat), total: n(o.total) },
    rev: Math.trunc(n(o.revision)), createdAt: o.createdDate ?? null, createdByName: o.createdBy ?? "", updatedAt: o.updatedDate ?? o.createdDate ?? null,
    log: [...(prev?.log ?? [{ a: "created", at: o.createdDate, by: null, byName: o.createdBy ?? "System" }]).filter(e => e.a !== "header" || e.byName !== "Claude"),
      { a: "header", at: o.updatedDate ?? o.createdDate, by: null, byName: "Claude", note: "imported from admin.lighthouse.co.th" }],
  };
}

function linesOf(order, items, crew) {
  const out = [], counted = order.status === "Shipped" ? "out" : ["Returned", "Draft INV"].includes(order.status) ? "both" : "none";
  const counts = qty => counted === "out" ? { out: qty, in: 0 } : counted === "both" ? { out: qty, in: qty } : { out: 0, in: 0 };
  for (const x of items) {
    const w = x.productWrapper ?? {}, k = `L${x.id}`, qty = n(x.qty);
    out.push({ k, t: x.__type, pid: x.productId ?? null, code: w.productCode ?? "", desc: x.description ?? w.description ?? "", list: n(x.listPrice), qty, days: n(x.day),
      disc: n(x.discount), foc: !!x.freeOfChange, sb: !!x.standBy, parent: null, start: day(x.usageDateStart), end: day(x.usageDateEnd), remark: x.remark ?? "",
      ...counts(qty), dmg: 0, lost: 0, ...(x.storeAdd === true && { storeAdd: true }) });
    (w.orderProductChildWrappers ?? []).forEach((c, i) => {
      const cq = n(c.quantity);
      out.push({ k: `${k}c${i}`, t: x.__type, pid: c.productId ?? null, code: c.productCode ?? "", desc: c.childDescription ?? "", list: n(c.listPrice), qty: cq,
        ratio: qty ? cq / qty : 1, days: n(c.day ?? x.day), disc: n(c.discount), foc: false, sb: false, parent: k, // parts never carry FOC/standby themselves (as on 23 Oct)
        start: day(x.usageDateStart), end: day(x.usageDateEnd), remark: "", ...counts(cq), dmg: 0, lost: 0 });
    });
  }
  for (const c of crew) {
    const qty = n(c.qty), days = n(c.day), list = n(c.price), ot = n(c.otHour), otRate = n(c.ot);
    const gross = list * qty * days + otRate * ot * qty, total = n(c.total);
    out.push({ k: `C${c.id}`, t: c.__type, pid: null, crewId: c.crewId == null ? undefined : String(c.crewId), code: c.crewCode ?? "",
      desc: [c.position, c.crewName].filter(Boolean).join(" · "), list, qty, days, ot, otRate,
      disc: gross > 0 && total < gross ? L.r2(100 * (1 - total / gross)) : 0, foc: false, sb: false, parent: null,
      start: day(c.usageDateStart), end: day(c.usageDateEnd), remark: c.remark ?? "", legacyAmount: total });
  }
  return out;
}

const ADJ_MIN = 1000, ADJ_PCT = 0.02;
/** The adjust that makes v2's sub total equal the old system's, or null when the gap is too big to hide. */
const isStoreAdd = l => l.storeAdd === true || /^\s*store add\s*$/i.test(l.remark ?? "");
function adjustOf(order, lines) {
  const T = L.orderTotals(lines, { extraDisc: order.extraDisc, insurance: order.insurance, adjust: 0, tax: order.tax });
  const gap = L.r2(order.legacyTotals.sub - (T.sub - T.extra));
  if (gap <= -0.05 && lines.some(isStoreAdd)) return "storeAdd";
  return Math.abs(gap) <= Math.max(ADJ_MIN, ADJ_PCT * Math.abs(order.legacyTotals.sub)) ? gap : null;
}

const newStats = () => ({ open: 0, newJobs: 0, changed: 0, closed: 0, lines: 0, adjusted: [], storeAddGap: [], mismatched: [] });

/** Converts one or more pulls (in order) into `dir`; meta/sync.json describes them together. */
function convert(pulls, dir) {
  const stats = newStats(), list = [].concat(pulls);
  for (const pull of list) convertOne(pull, dir, stats);
  const last = list[list.length - 1], runs = list.map(p => p.run).join(", ");
  fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
  fs.writeFileSync(path.join(dir, "meta/sync.json"), JSON.stringify({ at: last.at, jobs: stats.open, note: `Read-only sync (scripts/sync), run ${runs}: ${stats.newJobs} new, ${stats.changed} refreshed, ${stats.closed} re-checked after leaving the open list`, source: "admin.lighthouse.co.th",
    adjusted: stats.adjusted, storeAddGap: stats.storeAddGap, mismatched: stats.mismatched }));
  return stats;
}

function convertOne(pull, dir, stats) {
  const od = path.join(dir, "orders"), ld = path.join(dir, "lines"); fs.mkdirSync(od, { recursive: true }); fs.mkdirSync(ld, { recursive: true });
  const read = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
  for (const o of pull.orders) {
    const no = fileNo(o, od), order = orderOf(o, read(path.join(od, `${no}.json`)), no);
    const lines = linesOf(order, pull.items[o.id] ?? [], pull.crew[o.id] ?? []);
    if (!fs.existsSync(path.join(od, `${order.no}.json`))) stats.newJobs++; else stats.changed++;
    order.usage = L.usageOf(lines);
    const adj = adjustOf(order, lines);
    if (adj == null) stats.mismatched.push(order.no); else if (adj === "storeAdd") stats.storeAddGap.push(order.no);
    else { order.adjust = adj; if (Math.abs(adj) >= 1) stats.adjusted.push([order.no, adj]); }
    fs.writeFileSync(path.join(od, `${order.no}.json`), JSON.stringify(order));
    fs.writeFileSync(path.join(ld, `${order.no}.json`), JSON.stringify({ items: lines, updatedAt: order.updatedAt }));
    stats.open++; stats.lines += lines.length;
  }
  // left the open list since last time: keep its lines, take its status and header from the old system now
  for (const [id, d] of Object.entries(pull.detail ?? {})) {
    if (!d || !d.orderId) continue;
    const f = path.join(od, `${fileNo({ ...d, id: d.id ?? +id }, od)}.json`), prev = read(f); if (!prev) continue;
    const st = d.status == null && String(d.orderId).startsWith("Q") ? "Quote" : STATUS[d.status] ?? prev.status;
    fs.writeFileSync(f, JSON.stringify({ ...prev, status: st, updatedAt: d.updatedDate ?? prev.updatedAt })); stats.closed++;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2), files = args.filter(a => a.endsWith(".json")), dir = args.find(a => !a.endsWith(".json")) ?? path.join(__dirname, "../../data/export");
  if (!files.length) { console.error("usage: node scripts/sync/convert.js <pull.json>... [exportDir]"); process.exit(1); }
  const s = convert(files.map(f => JSON.parse(fs.readFileSync(f, "utf8"))), dir);
  console.log(JSON.stringify({ ...s, adjusted: s.adjusted.length, storeAddGap: s.storeAddGap, mismatched: s.mismatched.length > 50 ? s.mismatched.length : s.mismatched }));
}
module.exports = { convert, orderOf, linesOf, statusOf, noOf, fileNo, adjustOf };
