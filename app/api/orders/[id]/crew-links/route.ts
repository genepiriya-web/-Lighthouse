// GET  /api/orders/:id/crew-links — links sent for this job and their state (admin).
// POST /api/orders/:id/crew-links — new expiring link for a client. Body: { recipient, hours (1–168), maxViews?, show: full|masked }.
//      The link is returned once; only its hash is kept.
import { handle, readJson } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { createLink, listLinks } from "../../../../../lib/server/crewids";

type Ctx = { params: Promise<{ id: string }> };
export const GET = handle(async (req: Request, { params }: Ctx) => { const { id } = await params;
  return Response.json(await tx(async c => ({ links: await listLinks(c, await requireStaff(c, req), id) }))); });
export const POST = handle(async (req: Request, { params }: Ctx) => { const { id } = await params; const b = await readJson(req);
  return Response.json(await tx(async c => createLink(c, await requireStaff(c, req), id, b)), { status: 201, headers: { "cache-control": "no-store" } }); });
