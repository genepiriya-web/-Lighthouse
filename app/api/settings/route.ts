// GET /api/settings — company details, remark/footer templates and sales list (any staff).
import { handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { getSettings } from "../../../lib/server/master";

export const GET = handle(async (req: Request) => Response.json(await tx(async c => { await requireStaff(c, req); return getSettings(c); })));
