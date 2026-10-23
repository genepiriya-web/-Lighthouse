// GET /api/customers?q= — customer search for the job form (any staff). No tax IDs.
import { handle } from "../../../lib/server/http";
import { requireStaff } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";
import { searchCustomers } from "../../../lib/server/catalog";

export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q") || "";
  return Response.json(await tx(async c => { await requireStaff(c, req); return { customers: await searchCustomers(c, q) }; }));
});
