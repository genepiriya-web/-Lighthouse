// GET /api/dev/staff — the "sign in as" list for local development. 404 unless LHD_AUTH=dev against a local database.
import { ApiError, handle } from "../../../../lib/server/http";
import { devAuthOn } from "../../../../lib/server/auth";
import { pool } from "../../../../lib/server/db";

export const GET = handle(async () => {
  if (!devAuthOn()) throw new ApiError(404, "not_found");
  const r = await pool().query("select user_id as id, display_name as name, role from staff where active order by role, display_name");
  return Response.json({ staff: r.rows });
});
