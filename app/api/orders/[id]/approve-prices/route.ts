// POST /api/orders/:id/approve-prices — CEO (admin role) confirms the job's special prices. Body: { rev }.
import { handle, readJson } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { approvePrices } from "../../../../../lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params; const body = await readJson(req);
  return Response.json(await tx(async c => approvePrices(c, await requireStaff(c, req), id, body)));
});
