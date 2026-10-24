// PATCH /api/feedback/:id { status: new|seen|done } — admin.
import { ApiError, handle, readJson } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { markFeedback } from "../../../../lib/server/master";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = handle(async (req: Request, { params }: Ctx) => { const n = Number((await params).id); if (!Number.isInteger(n)) throw new ApiError(404, "not_found");
  const b = await readJson(req); return Response.json(await tx(async c => markFeedback(c, await requireStaff(c, req), n, b))); });
