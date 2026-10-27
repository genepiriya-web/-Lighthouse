import type { Line, OrderMoney, Totals } from "../src/logic";

export function isFuelDesc(d: unknown): boolean;
export function kvaOf(d: unknown): number | null;
export function isGeneratorDesc(d: unknown): boolean;
export function fuelItemFor<T extends { desc?: string | null }>(genDesc: unknown, items: T[]): T | null;
export const FUEL_HOURS: number;
export const FUEL_SIZE_STANDIN: Record<number, number>;
export function orderTotalsV2(lines: Line[], o: (OrderMoney & { owner?: string | null }) | undefined): Totals;
