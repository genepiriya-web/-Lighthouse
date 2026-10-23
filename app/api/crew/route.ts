// GET /api/crew?q=&dept= — crew and their position rates for the job's crew picker (any staff). No crew costs.
import { handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { searchCrew } from "../../../lib/server/catalog";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  return Response.json(await tx(async c => { await requireStaff(c, req);
    return { crew: await searchCrew(c, u.searchParams.get("q") || "", Number(u.searchParams.get("dept")) || undefined) }; }));
});
