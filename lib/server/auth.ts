// Who is calling, and what role they have.
//
// LHD_AUTH=dev  — local development and tests only. The caller's user id comes from the `x-dev-user` header.
//                 Refused unless DATABASE_URL points at this machine (127.0.0.1 / localhost / ::1), so it can never
//                 be switched on against a hosted database by a stray environment variable.
// otherwise     — Supabase session verification. Not built yet (M6, once the Supabase project exists): every
//                 request is treated as signed out (401). Nothing is guessed.
import "server-only";
import type { PoolClient } from "pg";
import { ApiError } from "./http";
import { dbHost } from "./db";
import type { Role } from "../logic";

export interface Caller { id: string; name: string; role: Exclude<Role, "none">; }

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function callerId(req: Request): string | null {
  if (process.env.LHD_AUTH === "dev") {
    if (!LOOPBACK.has(dbHost())) throw new ApiError(500, "dev_auth_refused", "LHD_AUTH=dev only works against a local database");
    const id = req.headers.get("x-dev-user");
    return id && UUID.test(id) ? id : null;
  }
  return null;
}

/** The signed-in, active staff member, or a 401/403. */
export async function requireStaff(c: PoolClient, req: Request): Promise<Caller> {
  const id = callerId(req);
  if (!id) throw new ApiError(401, "signed_out");
  const r = await c.query("select display_name, role from staff where user_id = $1 and active", [id]);
  if (!r.rowCount) throw new ApiError(403, "not_staff");
  return { id, name: r.rows[0].display_name, role: r.rows[0].role };
}
