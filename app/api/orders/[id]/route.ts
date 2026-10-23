// GET   /api/orders/:id  — job, lines and activity.
// PATCH /api/orders/:id  — header and money fields. Body: { rev, ...fields }. 409 `stale` if rev is out of date.
import { handle, readJson } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { getOrder, updateOrder } from "../../../../lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  return Response.json(await tx(async c => { await requireStaff(c, req); return getOrder(c, id); }));
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params; const body = await readJson(req);
  return Response.json(await tx(async c => updateOrder(c, await requireStaff(c, req), id, body)));
});
