// Types for src/logic.js. The JS file is the spec and is shared unchanged by the artifact page, the server and the client.
// Keep these in step with the JS; `npm run typecheck` fails if a signature drifts from how the app calls it.

export type ItemType = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Status = "Quote" | "Order" | "Approve" | "Shipped" | "Returned" | "Draft INV" | "Cancel";
export type Role = "admin" | "sale" | "store" | "accounting" | "crew" | "none";
export type ReasonKey = "rFlow" | "rRole" | "rNeedCust" | "rNeedDates" | "rNeedItems" | "rClash" | "rCheckOut" | "rCheckIn" | "rNoCancel";

export interface Line {
  k?: string; t: ItemType | number; pid?: number | null; code?: string; desc?: string;
  list?: number; qty?: number; days?: number; disc?: number; foc?: boolean; sb?: boolean;
  ot?: number; otRate?: number; ratio?: number; parent?: string | null | boolean;
  start?: string; end?: string; out?: number; in?: number; dmg?: number; lost?: number; repaired?: boolean;
  crewId?: string; remark?: string; legacyAmount?: number;
}
export interface OrderMoney { extraDisc?: number; insurance?: number; adjust?: number; tax?: "Vat" | "Not Vat" | string; }
export interface Order extends OrderMoney {
  id?: string; no?: string; status: Status | string; customerName?: string; ship?: string; ret?: string;
  useStart?: string; useEnd?: string; usage?: Array<[number, number]>; sale?: string;
  rentType?: "Daily" | "Weekly" | string; dpw?: number;
  totals?: Partial<Totals>; legacyTotals?: { sub?: number; total?: number };
}
export interface LineCalc { amount: number; total: number; disc: number; }
export interface Totals { list: number; disc: number; sub: number; extra: number; adj: number; ins: number; base: number; vat: number; total: number; }
export interface Issue { pid: number; short: number; }
export interface Product { id: number; code: string; desc: string; type: number; price: number; stock: number; discountable: number | boolean; maxDisc: number; }

export const TYPES: Array<{ id: number; k: string }>;
export const STOCKED_TYPES: number[];
export const STATUSES: Status[];
export const BLOCKING: Status[];
export const OPEN: Status[];
export const MOVES: Record<string, string[]>;
export const MOVE_ROLES: Record<string, Role[]>;

export function r2(n: unknown): number;
export function pD(s: string): number;
export function spanDays(a?: string, b?: string): number;
export function chargeDays(a: string | undefined, b: string | undefined, rentType?: string, dpw?: number): number;
export function defaultDisc(prod: Pick<Product, "discountable" | "maxDisc"> | null | undefined, custDisc?: number): number;
export function lineCalc(l: Line): LineCalc;
export function typeTotals(lines: Line[], t: number): { list: number; disc: number; sub: number };
export function orderTotals(lines: Line[], o?: OrderMoney | null): Totals;
export function usageOf(lines: Line[]): Array<[number, number]>;
export function overlaps(o: Order, a: string, b: string, today?: string): boolean;
export function bookedQty(pid: number, a: string, b: string, orders: Order[], exclId?: string | null, today?: string, statuses?: string[]): number;
export function expandKit(parentLine: Line, kit: Array<[number, number, number?]>, catalog: Map<number, { code: string; desc: string }>, newKey: () => string): Line[];
export function syncChildren(lines: Line[]): Line[];
export function moveCheck(role: Role | string, o: Order, to: Status | string, lines: Line[], issues?: Issue[]): ReasonKey | null;
export function canEditLines(role: Role | string, status: Status | string): boolean;
export function orderNo(beYear2: number, seq: number): string;
export function addDays_(s: string, n: number): string;
export function eachDay(a: string, b: string, fn: (d: string) => void): void;
export function netOf(o: Order): number;
export function diagnose(orders: Order[], linesById: Record<string, { items?: Line[] }>, cat: Map<number, Product>, today: string, opt?: { horizonDays?: number; staleDays?: number }): {
  problems: Array<{ kind: string; sev: string; no: string | null; id: string | null; msg: string; [k: string]: unknown }>;
  money: Record<string, unknown>;
  assets: Record<string, unknown>;
};
