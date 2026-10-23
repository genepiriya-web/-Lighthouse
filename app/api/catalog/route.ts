// GET  /api/catalog?q=&type=&dept=&limit= — catalog list (any staff).
// POST /api/catalog — new item (admin, store). Body: { code, desc, type, dept, price, discountable, maxDisc, stock, kit? }.
import { handle, readJson } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { createProduct, listProducts } from "../../../lib/server/master";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url); const n = (k: string) => Number(u.searchParams.get(k)) || undefined;
  return Response.json(await tx(async c => { await requireStaff(c, req);
    return { products: await listProducts(c, { q: u.searchParams.get("q") || undefined, type: n("type"), dept: n("dept"), limit: n("limit") }) }; }));
});
export const POST = handle(async (req: Request) => { const b = await readJson(req);
  return Response.json(await tx(async c => createProduct(c, await requireStaff(c, req), b)), { status: 201 }); });
