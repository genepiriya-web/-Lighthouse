// GET /api/orders/:id/crew — the job's named crew and whether their ID is on file (masked). Admin only.
import { handle } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { jobCrewStatus } from "../../../../../lib/server/crewids";

type Ctx = { params: Promise<{ id: string }> };
export const GET = handle(async (req: Request, { params }: Ctx) => { const { id } = await params;
  return Response.json(await tx(async c => ({ crew: await jobCrewStatus(c, await requireStaff(c, req), id) }))); });
