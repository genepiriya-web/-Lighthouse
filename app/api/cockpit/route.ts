// GET /api/cockpit — problems, money and equipment over all open jobs (admin, as on the artifact).
// `?today=YYYY-MM-DD` pins the date for tests; honoured only under local dev sign-in.
import { ApiError, handle } from "../../../lib/server/http";
import { devAuthOn, requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { cockpit } from "../../../lib/server/cockpit";

const bangkokToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

export const GET = handle(async (req: Request) => Response.json(await tx(async c => {
  const who = await requireStaff(c, req); if (who.role !== "admin") throw new ApiError(403, "rRole");
  const pinned = new URL(req.url).searchParams.get("today");
  return cockpit(c, pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned) && devAuthOn() ? pinned : bangkokToday());
})));
