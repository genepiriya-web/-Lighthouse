// The one door to the pricing/status spec for the Next.js app. Server routes and client components both import from here,
// so they run the exact same src/logic.js the artifact page inlines. Exports are listed by name because logic.js is CommonJS.
import * as logic from "../src/logic.js";

export type { ItemType, Status, Role, ReasonKey, Line, OrderMoney, Order, LineCalc, Totals, Issue, Product } from "../src/logic.js";

export const {
  TYPES, STOCKED_TYPES, STATUSES, BLOCKING, OPEN, MOVES, MOVE_ROLES,
  r2, pD, spanDays, chargeDays, defaultDisc, lineCalc, typeTotals, orderTotals, usageOf, overlaps, bookedQty,
  expandKit, syncChildren, moveCheck, canEditLines, orderNo, addDays_, eachDay, netOf, diagnose,
} = logic;
