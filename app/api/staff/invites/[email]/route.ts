// DELETE /api/staff/invites/:email — withdraw an unused invite (admin).
import { handle } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { deleteInvite } from "../../../../../lib/server/master";

type Ctx = { params: Promise<{ email: string }> };
export const DELETE = handle(async (req: Request, { params }: Ctx) => { const { email } = await params;
  return Response.json(await tx(async c => deleteInvite(c, await requireStaff(c, req), decodeURIComponent(email)))); });
