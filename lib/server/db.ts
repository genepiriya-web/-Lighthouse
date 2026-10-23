// Server-only Postgres access. Every write runs in tx(), which switches to service_role for the transaction:
// row-level security is bypassed (the server enforces roles with logic.js first), but the database's own guards
// (legacy jobs read-only, activity append-only) still apply.
import "server-only";
import { Pool, types, type PoolClient } from "pg";

types.setTypeParser(1700, v => parseFloat(v)); // numeric → number (values originate as JS numbers)
types.setTypeParser(1082, v => v);             // date → 'YYYY-MM-DD' string, no timezone shift

const g = globalThis as unknown as { __lhdPool?: Pool };

export function pool(): Pool {
  if (!g.__lhdPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    g.__lhdPool = new Pool({ connectionString, max: 10 });
  }
  return g.__lhdPool;
}

export function dbHost(): string {
  try { return new URL(process.env.DATABASE_URL || "").hostname; } catch { return ""; }
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    await c.query("set local role service_role");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
