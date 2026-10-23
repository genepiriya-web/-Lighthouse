// GET /api/crew-rates?q= — crew rates by position (view only, as on the artifact). Cost only for admin and crew manager.
import { handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { listCrewRates } from "../../../lib/server/master";

export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q") || "";
  return Response.json(await tx(async c => ({ rates: await listCrewRates(c, await requireStaff(c, req), q) })));
});
