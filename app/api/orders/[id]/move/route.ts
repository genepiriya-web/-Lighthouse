// POST /api/orders/:id/move — status move. Body: { rev, to }. Guards and roles from logic.js moveCheck.
import { handle, readJson } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { moveOrder } from "../../../../../lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params; const body = await readJson(req);
  return Response.json(await tx(async c => moveOrder(c, await requireStaff(c, req), id, body)));
});
