// POST /api/crew-ids/:crewId/reveal — admin sees one full ID. Every call is logged (who, when, which crew member).
import { handle } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { revealId } from "../../../../../lib/server/crewids";

type Ctx = { params: Promise<{ crewId: string }> };
export const POST = handle(async (req: Request, { params }: Ctx) => { const { crewId } = await params;
  const r = await tx(async c => revealId(c, await requireStaff(c, req), crewId));
  return Response.json(r, { headers: { "cache-control": "no-store" } }); });
