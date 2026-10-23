// POST /api/orders/:id/checkin — at Shipped. Body: { rev, lines: [{ k, in, dmg, lost }] } or { rev, all: true }.
import { handle, readJson } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { storeCounts } from "../../../../../lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params; const body = await readJson(req);
  return Response.json(await tx(async c => storeCounts(c, await requireStaff(c, req), id, "in", body)));
});
