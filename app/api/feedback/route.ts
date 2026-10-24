// POST /api/feedback { page, text } — any staff sends a note from the screen they're on.
// GET  /api/feedback — admin reads them, new first.
import { handle, readJson } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { listFeedback, sendFeedback } from "../../../lib/server/master";

export const GET = handle(async (req: Request) => Response.json(await tx(async c => ({ feedback: await listFeedback(c, await requireStaff(c, req)) }))));
export const POST = handle(async (req: Request) => { const b = await readJson(req);
  return Response.json(await tx(async c => sendFeedback(c, await requireStaff(c, req), b)), { status: 201 }); });
