// GET  /api/staff/invites — pending and used invites (admin).
// POST /api/staff/invites — invite an email with a role (admin). Body: { email, role, name? }. They join on first sign-in.
import { handle, readJson } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { createInvite, listInvites } from "../../../../lib/server/master";

export const GET = handle(async (req: Request) => Response.json(await tx(async c => ({ invites: await listInvites(c, await requireStaff(c, req)) }))));
export const POST = handle(async (req: Request) => { const b = await readJson(req);
  return Response.json(await tx(async c => createInvite(c, await requireStaff(c, req), b)), { status: 201 }); });
