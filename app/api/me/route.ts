// GET /api/me — the caller's staff record (role decides what the UI shows; the server still checks every write).
import { handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";

export const GET = handle(async (req: Request) => Response.json(await tx(c => requireStaff(c, req))));
