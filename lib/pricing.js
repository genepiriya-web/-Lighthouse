// v2 job totals (Gene, 27 Oct 2026): on v2 jobs the order-level extra discount % comes off the Equipment sub total only,
// like line discounts (lib/rules.ts canDiscount). Everything else is src/logic.js orderTotals unchanged, and old-system
// jobs (owner "legacy", or no owner given, as on the artifact page) keep logic.js's formula: extra % of the whole sub total.
// Plain CommonJS so lib/docs.js, lib/quoteform.js and node tests can load it, like src/logic.js.
const L = require("../src/logic.js");

function orderTotalsV2(lines, o) {
  const G = L.orderTotals(lines, o);
  if (!o || o.owner !== "v2") return G;
  const xp = Math.max(0, Math.min(100, +o.extraDisc || 0));
  const extra = L.r2(L.typeTotals(lines, 1).sub * xp / 100);
  const base = L.r2(G.sub - extra + G.adj + G.ins);
  const vat = o.tax === "Not Vat" ? 0 : L.r2(base * 0.07);
  return { ...G, extra, base, vat, total: L.r2(base + vat) };
}

/* Generator fuel by size (Gene, 27 Oct 2026). The catalog has one "Hour Gasoline <n> KVA" item per generator size with
   its hourly rate (45 KVA 300, 60 KVA 360, 90/100 KVA 500, 125 KVA 700, 183 KVA 1,000, 270 KVA 1,500 on 23 Oct). Most
   generator packages list that item without a price, and some don't list it at all; v2 fills the rate from the catalog and
   adds the line where it is missing. The rates stay in the catalog, never in code. */
const isFuelDesc = d => /^hour\s/i.test(String(d ?? "").trim());
const kvaOf = d => { const m = /(\d+(?:\.\d+)?)\s*kva/i.exec(String(d ?? "")); return m ? +m[1] : null; };
const isGeneratorDesc = d => /^(ultra silent\s+)?generator\b/i.test(String(d ?? "").trim()) && kvaOf(d) != null;
/** Sizes with no fuel item of their own use another size's, until the catalog has one (Gene, 27 Oct 2026: the Ultra
 *  Silent 150 KVA uses the 125 KVA rate, 700/hour; the old system has no 150 KVA fuel item). */
const FUEL_SIZE_STANDIN = { 150: 125 };
/** The fuel-hour catalog item for a generator: same KVA, else its stand-in size. `items`: catalog rows with id, desc, price. */
const fuelItemFor = (genDesc, items) => { const k = kvaOf(genDesc); if (k == null) return null;
  const find = n => (items || []).find(x => isFuelDesc(x.desc) && kvaOf(x.desc) === n) || null;
  return find(k) || (FUEL_SIZE_STANDIN[k] != null ? find(FUEL_SIZE_STANDIN[k]) : null); };
const FUEL_HOURS = 12; // the hours every generator package lists today (1 cue)

module.exports = { orderTotalsV2, isFuelDesc, kvaOf, isGeneratorDesc, fuelItemFor, FUEL_HOURS, FUEL_SIZE_STANDIN };
