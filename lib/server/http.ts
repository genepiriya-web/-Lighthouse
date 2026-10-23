// Errors and the route wrapper. Every API route returns JSON: { error: code, message, ...extra } on failure.
import "server-only";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra?: Record<string, unknown>) {
    super(message ?? code);
  }
}

export const bad = (code: string, message?: string, extra?: Record<string, unknown>) => new ApiError(422, code, message, extra);

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status });
      const pg = e as { code?: string; message?: string };
      // 42501 = a database guard refused (legacy job, append-only log). The server checks first; this is the backstop.
      if (pg?.code === "42501") return Response.json({ error: "forbidden_by_database", message: pg.message }, { status: 403 });
      console.error("api error", e);
      return Response.json({ error: "internal" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}
