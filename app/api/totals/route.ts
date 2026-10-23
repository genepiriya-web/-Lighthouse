// POST /api/totals — prices a job on the server with the shared logic. Read-only: it stores nothing.
// M3 replaces this with authenticated order endpoints; it exists now to prove server and client compute the same numbers.
import { orderTotals, lineCalc, type Line, type OrderMoney } from "../../../lib/logic";

const MAX_LINES = 2000;

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const { lines, order } = (body ?? {}) as { lines?: unknown; order?: unknown };
  if (!Array.isArray(lines) || lines.length > MAX_LINES) return Response.json({ error: "lines_must_be_array" }, { status: 400 });
  const ls = lines as Line[];
  return Response.json({ totals: orderTotals(ls, (order ?? {}) as OrderMoney), lines: ls.map(lineCalc) });
}
