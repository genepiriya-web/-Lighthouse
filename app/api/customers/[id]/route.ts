// GET   /api/customers/:id — one customer and their recent jobs; tax ID only for admin, sale, accounting.
// PATCH /api/customers/:id — edit (admin, sale). Body: { updatedAt, ...fields, flaggedNew: false to mark checked }.
import { handle, readJson } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { getCustomer, updateCustomer } from "../../../../lib/server/master";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => { const { id } = await params;
  return Response.json(await tx(async c => getCustomer(c, await requireStaff(c, req), id))); });
export const PATCH = handle(async (req: Request, { params }: Ctx) => { const { id } = await params; const b = await readJson(req);
  return Response.json(await tx(async c => updateCustomer(c, await requireStaff(c, req), id, b))); });
