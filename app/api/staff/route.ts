// GET /api/staff — the team and their roles (admin). Adding people comes with real sign-in (M6).
import { ApiError, handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { listStaff } from "../../../lib/server/master";

export const GET = handle(async (req: Request) => Response.json(await tx(async c => {
  const who = await requireStaff(c, req); if (who.role !== "admin") throw new ApiError(403, "rRole");
  return { staff: await listStaff(c) };
})));
