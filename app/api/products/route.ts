// GET /api/products?q=&type=&dept=&ids=1,2 — catalog search for the item picker (any staff).
import { handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { searchProducts } from "../../../lib/server/catalog";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url); const n = (k: string) => Number(u.searchParams.get(k)) || undefined;
  const ids = (u.searchParams.get("ids") || "").split(",").map(Number).filter(x => Number.isInteger(x) && x > 0).slice(0, 200);
  return Response.json(await tx(async c => { await requireStaff(c, req);
    return { products: await searchProducts(c, { q: u.searchParams.get("q") || undefined, type: n("type"), dept: n("dept"), ids, limit: n("limit") }) }; }));
});
