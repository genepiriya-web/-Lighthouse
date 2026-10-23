// GET /api/crew-ids — which crew have a national ID on file, masked (x-xxxx-xxxxx-12-3). Admin only; not logged (no full IDs).
import { handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { idStatus } from "../../../lib/server/crewids";

export const GET = handle(async (req: Request) => Response.json(await tx(async c => ({ masked: await idStatus(c, await requireStaff(c, req)) }))));
