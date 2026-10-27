import type { Line, OrderMoney, Totals } from "../src/logic";

export function orderTotalsV2(lines: Line[], o: (OrderMoney & { owner?: string | null }) | undefined): Totals;
