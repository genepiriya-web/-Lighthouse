// GET  /api/customers?q=&flagged=1&limit= — customers, flagged-new first (any staff). No tax IDs.
// POST /api/customers — new customer (admin, sale). Body: { code?, name, jobType?, defaultDisc?, billing?, phone?, fax?, taxId? }.
import { handle, readJson } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { createCustomer, listCustomers } from "../../../lib/server/master";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  return Response.json(await tx(async c => { await requireStaff(c, req);
    return { customers: await listCustomers(c, { q: u.searchParams.get("q") || undefined, flagged: u.searchParams.get("flagged") === "1", limit: Number(u.searchParams.get("limit")) || undefined }) }; }));
});
export const POST = handle(async (req: Request) => { const b = await readJson(req);
  return Response.json(await tx(async c => createCustomer(c, await requireStaff(c, req), b)), { status: 201 }); });
