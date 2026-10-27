// PUT /api/board/:orderId/:day — save one job's board entry for one day (admin, sales/Support, store).
// Body: { loc, onloc, head, crew, trucks, gens, remark, updatedAt } — updatedAt as last read (omit for a new entry).
import { handle, readJson } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { saveBoardEntry } from "../../../../../lib/server/board";

type Ctx = { params: Promise<{ id: string; day: string }> };

export const PUT = handle(async (req: Request, { params }: Ctx) => { const { id, day } = await params; const b = await readJson(req);
  return Response.json(await tx(async c => saveBoardEntry(c, await requireStaff(c, req), id, day, b))); });
