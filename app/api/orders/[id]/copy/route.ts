// POST /api/orders/:id/copy — copy any job (legacy too) as a new v2 quote (sale, admin). Returns { id, no, rev }.
import { handle } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { copyOrder } from "../../../../../lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  return Response.json(await tx(async c => copyOrder(c, await requireStaff(c, req), id)), { status: 201 });
});
