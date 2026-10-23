// POST /api/orders/:id/fix-status — admin correction. Body: { rev, to, reason }. Logged as status_fix.
import { handle, readJson } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { fixStatus } from "../../../../../lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params; const body = await readJson(req);
  return Response.json(await tx(async c => fixStatus(c, await requireStaff(c, req), id, body)));
});
