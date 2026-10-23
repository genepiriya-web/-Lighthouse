// GET /api/repairs?status=wait|doing|done|lost — repair tickets, newest first (any staff).
import { handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { listRepairs } from "../../../lib/server/catalog";

export const GET = handle(async (req: Request) => {
  const status = new URL(req.url).searchParams.get("status") || undefined;
  return Response.json(await tx(async c => { await requireStaff(c, req); return { repairs: await listRepairs(c, status) }; }));
});
