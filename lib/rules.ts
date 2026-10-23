// Price rule (Gene, 23 Oct 2026, replacing Q21 option b): sales may price an item below its catalog day rate or discount
// it beyond what the catalog allows, but the job can't move to Shipped until the CEO (admin role) confirms those prices.
// Shared so the screens can show what still needs the CEO before the server refuses the move.
//
// Same reading of the catalog as logic.js defaultDisc() and the Cockpit's "Discount breaks rule" check:
//   not discountable → no discount at all; maxDisc > 0 → that cap; maxDisc 0 → no cap.
// Lines without a catalog price to compare against are exempt, as in the Cockpit: package parts (priced by the kit),
// crew and freelance (priced by crew rates), lines with no product, and FOC/standby lines (priced 0 by design).
import type { Line, Product, Role, Status } from "./logic";

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

export interface PriceApproval { by: string; by_name: string; at: string; breaks: PriceBreak[]; }

/** Breaks the CEO hasn't confirmed. A confirmation covers a break only while its line, rule and value stay the same,
 *  so changing an approved price again needs a new confirmation. A later catalog price change doesn't undo it. */
export function unapproved(current: PriceBreak[], approval: PriceApproval | null | undefined): PriceBreak[] {
  const ok = new Set((approval?.breaks ?? []).map(b => `${b.k}|${b.rule}|${b.value}`));
  return current.filter(b => !ok.has(`${b.k}|${b.rule}|${b.value}`));
}

// Who may edit what — the artifact's own UI rules (src/app.html sheetOrder / itemsSection), shared by server and screens.
export const canEditHeader = (role: Role | string, s: Status | string) => (role === "admin" && s !== "Draft INV") || (role === "sale" && (s === "Quote" || s === "Order"));
export const canEditMoney = (role: Role | string, s: Status | string) => s !== "Draft INV" && (role === "admin" || role === "accounting" || (role === "sale" && (s === "Quote" || s === "Order")));
export const canStore = (role: Role | string) => role === "admin" || role === "store";
