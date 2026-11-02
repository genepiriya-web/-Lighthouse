// GET  /api/orders?status=open|Quote|...&q=&limit=&before=  — list, newest order number first, paged by `before`.
//      `open` leaves out quotes that ended over 30 days ago; `q` alone searches every job.
// POST /api/orders  — create a v2 job (sale, admin). Body: header fields. Returns { id, no, rev }.
import { handle, readJson } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { createOrder, listOrders } from "../../../lib/server/orders";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  return Response.json(await tx(async c => {
    await requireStaff(c, req);
    return listOrders(c, { status: u.searchParams.get("status") || undefined, search: u.searchParams.get("q") || undefined,
      limit: Number(u.searchParams.get("limit")) || undefined, before: u.searchParams.get("before") || undefined });
  }));
});

export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  return Response.json(await tx(async c => createOrder(c, await requireStaff(c, req), body)), { status: 201 });
});
