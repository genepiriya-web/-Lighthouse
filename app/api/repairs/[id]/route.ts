// PATCH /api/repairs/:id — store/admin change a ticket's status or note. Body: { status?, note? }.
import { handle, readJson } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { updateRepair } from "../../../../lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params; const body = await readJson(req);
  return Response.json(await tx(async c => updateRepair(c, await requireStaff(c, req), id, body)));
});
