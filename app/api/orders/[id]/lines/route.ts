// PUT /api/orders/:id/lines — replace the item list. Body: { rev, lines }. Totals are recomputed on the server.
import { handle, readJson } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { saveLines } from "../../../../../lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params; const body = await readJson(req);
  return Response.json(await tx(async c => saveLines(c, await requireStaff(c, req), id, body)));
});
