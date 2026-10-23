// Price rule (Gene, 23 Oct 2026, PLAN.md Q21 option b): only an admin may price an item below its catalog day rate,
// or discount it beyond what the catalog allows. Shared so the screens (M4) can warn before the server refuses.
//
// Same reading of the catalog as logic.js defaultDisc() and the Cockpit's "Discount breaks rule" check:
//   not discountable → no discount at all; maxDisc > 0 → that cap; maxDisc 0 → no cap.
// Lines without a catalog price to compare against are exempt, as in the Cockpit: package parts (priced by the kit),
// crew and freelance (priced by crew rates), lines with no product, and FOC/standby lines (priced 0 by design).
import type { Line, Product } from "./logic";

export interface PriceBreak { k: string; code: string; rule: "below_catalog" | "no_discount" | "over_max_disc"; value: number; limit: number; }

export function priceBreaks(l: Line & { k: string }, p: Pick<Product, "price" | "discountable" | "maxDisc"> | undefined): PriceBreak[] {
  if (!p || l.parent || l.t === 5 || l.t === 7 || l.foc || l.sb) return [];
  const out: PriceBreak[] = []; const code = l.code ?? "";
  const list = Number(l.list) || 0, disc = Number(l.disc) || 0, price = Number(p.price) || 0, max = Number(p.maxDisc) || 0;
  if (list < price) out.push({ k: l.k, code, rule: "below_catalog", value: list, limit: price });
  if (disc > 0 && !p.discountable) out.push({ k: l.k, code, rule: "no_discount", value: disc, limit: 0 });
  else if (disc > 0 && max > 0 && disc > max) out.push({ k: l.k, code, rule: "over_max_disc", value: disc, limit: max });
  return out;
}
