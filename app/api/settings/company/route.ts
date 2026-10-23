// PUT /api/settings/company — company name, tax ID and address on documents (admin). Body: { name, tax?, addr? }.
import { handle, readJson } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { updateCompany } from "../../../../lib/server/master";

export const PUT = handle(async (req: Request) => { const b = await readJson(req);
  return Response.json(await tx(async c => updateCompany(c, await requireStaff(c, req), b))); });
