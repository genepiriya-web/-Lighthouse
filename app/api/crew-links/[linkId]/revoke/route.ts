// POST /api/crew-links/:linkId/revoke — admin stops a link at once (logged on the job).
import { handle } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { revokeLink } from "../../../../../lib/server/crewids";

type Ctx = { params: Promise<{ linkId: string }> };
export const POST = handle(async (req: Request, { params }: Ctx) => { const { linkId } = await params;
  return Response.json(await tx(async c => revokeLink(c, await requireStaff(c, req), linkId))); });
