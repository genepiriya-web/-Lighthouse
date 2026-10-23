// POST /api/crew-ids/import — admin. Body: { text, save }. save:false previews matches (IDs shown masked); save:true stores them encrypted.
import { handle, readJson } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { importIds } from "../../../../lib/server/crewids";

export const POST = handle(async (req: Request) => { const b = await readJson(req);
  return Response.json(await tx(async c => importIds(c, await requireStaff(c, req), b))); });
