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

module.exports = { orderTotalsV2 };
