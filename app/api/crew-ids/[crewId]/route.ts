// DELETE /api/crew-ids/:crewId — admin removes a stored ID (logged).
import { handle } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { removeId } from "../../../../lib/server/crewids";

type Ctx = { params: Promise<{ crewId: string }> };
export const DELETE = handle(async (req: Request, { params }: Ctx) => { const { crewId } = await params;
  return Response.json(await tx(async c => removeId(c, await requireStaff(c, req), crewId))); });
