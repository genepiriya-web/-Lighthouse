// Price rule (Gene, 23 Oct 2026, replacing Q21 option b): sales may price an item below its catalog day rate or discount
// it beyond what the catalog allows, but the job can't move to Shipped until the CEO (admin role) confirms those prices.
// Shared so the screens can show what still needs the CEO before the server refuses the move.
//
// Same reading of the catalog as logic.js defaultDisc() and the Cockpit's "Discount breaks rule" check:
//   not discountable → no discount at all; maxDisc > 0 → that cap; maxDisc 0 → no cap.
// Lines without a catalog price to compare against are exempt, as in the Cockpit: package parts (priced by the kit),
// crew and freelance (priced by crew rates), lines with no product, and FOC/standby lines (priced 0 by design).
import { BLOCKING, MOVES, moveCheck, canEditLines, type Line, type Order, type Product, type Role, type Status } from "./logic";

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

// ---------- Store addition (Gene, 27 Oct 2026) ----------
// Urgent items Store adds to a job at Approve go on a separate job linked to it, status "Store Add": it holds stock at
// once, carries no prices until Sales sets them, then Sales moves it to Approve and it follows the normal flow.
// v2's own rule, not the old system's: src/logic.js stays as it is and these wrap it.
export const STORE_ADD: string = "Store Add";
/** Statuses that hold stock: logic.js BLOCKING plus Store Add. */
export const HOLDING: string[] = [...BLOCKING, STORE_ADD];
/** What Store may add: gear and transport, not crew or freelance. */
export const STORE_ADD_TYPES = [1, 2, 3, 4, 6];
export const MOVES_V2: Record<string, string[]> = { ...MOVES, [STORE_ADD]: ["Approve"] };
export const canEditItems = (role: Role | string, s: Status | string) =>
  s === STORE_ADD ? role === "admin" || role === "sale" || role === "store" : canEditLines(role as Role, s as Status);
/** Lines Sales still has to price: not package parts (priced by the kit), FOC or standby. */
export const unpriced = (lines: Line[]) => lines.filter(l => !l.parent && !l.foc && !l.sb && !(Number(l.list) > 0));
/** logic.js moveCheck, plus the Store Add step. Returns null when allowed, else a reason key. */
export function moveCheckV2(role: Role | string, o: Partial<Order> & { status: string }, to: string, lines: Line[], issues: unknown[] | null): string | null {
  if (o.status !== STORE_ADD) return moveCheck(role as Role, o as Order, to, lines, issues as never);
  if (to === "Cancel") return role === "admin" || role === "sale" || role === "store" ? null : "rRole";
  if (to !== "Approve") return "rFlow";
  if (role !== "admin" && role !== "sale") return "rRole";
  if (!o.customerName) return "rNeedCust"; if (!o.ship || !o.ret) return "rNeedDates"; if (!lines.length) return "rNeedItems";
  if (issues && issues.length) return "rClash";
  if (unpriced(lines).length) return "rNeedPrices";
  return null;
}

// ---------- Sales people (Gene, 27 Oct 2026) ----------
// The sales person on a job is picked from a list. A `sales_people` row in settings replaces this default (v2's own key:
// the importer writes the old system's `sales`, never this). Not seeded by a migration, so a backup restore stays clean.
export const DEFAULT_SALES_PEOPLE = ["เชอร์รี่", "เบนซ์", "สอง"];

// ---------- Who sets which date (Gene, 27 Oct 2026) ----------
// Store also moves the return date, from Quote up to Shipped (e.g. the client extends). Support has Sales' rights, so the
// usage dates stay with Sales/Support through canEditHeader. Admin as before.
export const canEditReturn = (role: Role | string, s: Status | string) => canStore(role) && ["Quote", "Order", "Approve", "Shipped", STORE_ADD].includes(s);
export const canEditField = (role: Role | string, s: Status | string, k: string) => canEditHeader(role, s) || (k === "ret" && canEditReturn(role, s));

// ---------- Transport remarks (Gene, 27 Oct 2026) ----------
// Ready-made notes for transport lines; free text is allowed too. Printed in the quotation's Remark column.
export const TRANSPORT_REMARKS = ["ค่าน้ำมัน ทางด่วน เก็บสด", "ชั่วโมงน้ำมันเครื่องปั่นไม่คิด", "จัดทดแทน"];
