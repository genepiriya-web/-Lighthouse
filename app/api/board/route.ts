// GET /api/board?day=YYYY-MM-DD — the daily job board (any staff): every job working that day, with its board entry.
import { handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { getBoard } from "../../../lib/server/board";

export const GET = handle(async (req: Request) => {
  const day = new URL(req.url).searchParams.get("day");
  return Response.json(await tx(async c => { await requireStaff(c, req); return getBoard(c, day); }));
});
