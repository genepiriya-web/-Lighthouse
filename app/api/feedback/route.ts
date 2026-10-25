// POST /api/feedback { kind: bug|confusing|idea|other, page, text, meta } — any staff reports from the screen they're on.
//      Saved first, then announced in Discord (lib/server/notify.ts); a Discord failure never loses the report.
// GET  /api/feedback — admin reads them, new first (and any reports Discord hasn't received are retried).
import { handle, readJson } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { listFeedback, sendFeedback } from "../../../lib/server/master";
import { deliverPending, webhookUrl } from "../../../lib/server/notify";

export const GET = handle(async (req: Request) => {
  const list = await tx(async c => listFeedback(c, await requireStaff(c, req)));
  await deliverPending(); return Response.json({ feedback: list, discord: !!webhookUrl() });
});
export const POST = handle(async (req: Request) => { const b = await readJson(req);
  const r = await tx(async c => sendFeedback(c, await requireStaff(c, req), b)); // committed before Discord is tried
  await deliverPending(); return Response.json(r, { status: 201 }); });
