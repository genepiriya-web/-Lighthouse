// GET   /api/catalog/:id — one item with its package parts (any staff).
// PATCH /api/catalog/:id — edit (admin, store). Body: { updatedAt, ...fields }. 409 `stale` if someone saved first.
import { ApiError, handle, readJson } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { getProduct, updateProduct } from "../../../../lib/server/master";

type Ctx = { params: Promise<{ id: string }> };
const idOf = async (p: Ctx["params"]) => { const n = Number((await p).id); if (!Number.isInteger(n) || n < 1) throw new ApiError(404, "not_found"); return n; };

export const GET = handle(async (req: Request, { params }: Ctx) => { const id = await idOf(params);
  return Response.json(await tx(async c => { await requireStaff(c, req); return getProduct(c, id); })); });
export const PATCH = handle(async (req: Request, { params }: Ctx) => { const id = await idOf(params); const b = await readJson(req);
  return Response.json(await tx(async c => updateProduct(c, await requireStaff(c, req), id, b))); });
