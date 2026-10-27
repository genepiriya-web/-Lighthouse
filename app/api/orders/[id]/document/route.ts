// GET /api/orders/:id/document?kind=quote|draft|items&disc=1|0[&inline=1] — the job's printout as an HTML file (any staff),
// the same document the artifact page downloaded. `inline=1` returns it for the on-screen preview instead of a download.
// `format=pdf`: a PDF in the company's paper-form layout (lib/server/quotepdf.ts) for kind=quote (`disc=net` hides the
// discount: net prices, same totals), kind=items (store, no prices) and kind=job (crew job sheet, PDF only).
import { ApiError, handle } from "../../../../../lib/server/http";
import { requireStaff } from "../../../../../lib/server/auth";
import { tx } from "../../../../../lib/server/db";
import { getOrder } from "../../../../../lib/server/orders";
import { getSettings } from "../../../../../lib/server/master";
import { docFile, docName, fromRow, type DocKind } from "../../../../../lib/docs";
import { quoteFormFor, render } from "../../../../../lib/server/quotepdf";

type Ctx = { params: Promise<{ id: string }> };
const bangkokToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params; const u = new URL(req.url);
  const kind = (u.searchParams.get("kind") || "quote") as DocKind | "job"; if (!["quote", "draft", "items", "job"].includes(kind)) throw new ApiError(422, "bad_kind");
  const d = u.searchParams.get("disc"); const disc = d !== "0";
  if (u.searchParams.get("format") === "pdf") {
    if (kind === "draft") throw new ApiError(422, "bad_kind"); // the Draft INV has no paper-form layout yet
    const view = d === "net" ? "net" : disc ? "disc" : "list";
    const f = await tx(async c => quoteFormFor(c, await requireStaff(c, req), id, view, kind));
    return new Response(new Uint8Array(await render(f)), { headers: {
      "content-type": "application/pdf",
      "content-disposition": `${u.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${f.name}"`,
      "x-content-type-options": "nosniff",
    } });
  }
  if (kind === "job") throw new ApiError(422, "bad_kind"); // the crew job sheet is a PDF only
  const { html, name } = await tx(async c => {
    await requireStaff(c, req);
    const { order, lines } = await getOrder(c, id); const s = await getSettings(c); const o = fromRow(order);
    return { html: docFile(o, lines, kind, disc, { company: s.company, remarks: s.remarks, footers: s.footers, today: bangkokToday() }), name: docName(o, kind, disc) };
  });
  return new Response(html, { headers: {
    "content-type": "text/html; charset=utf-8",
    "content-disposition": `${u.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${name}"`,
    // The preview is shown in a sandboxed frame; scripts never run in it, whatever the templates contain.
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'",
    "x-content-type-options": "nosniff",
  } });
});
