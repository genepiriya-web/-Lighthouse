// PATCH /api/staff/:id — change someone's role, name, or switch them off (admin; never yourself). Body: { role?, active?, name? }.
import { handle, readJson } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { updateStaff } from "../../../../lib/server/master";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => { const { id } = await params; const b = await readJson(req);
  return Response.json(await tx(async c => updateStaff(c, await requireStaff(c, req), id, b))); });
