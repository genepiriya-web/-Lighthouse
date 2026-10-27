// POST /api/orders/:id/store-addition — Store (or admin) opens a linked "Store Add" job for urgent items while the job is
// at Approve (Gene, 27 Oct 2026). Returns { id, no, rev }.
import { handle } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { createStoreAddition } from "../../../../../lib/server/orders";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  return Response.json(await tx(async c => createStoreAddition(c, await requireStaff(c, req), id)), { status: 201 });
});
