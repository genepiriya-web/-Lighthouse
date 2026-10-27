// HTML → PDF with headless Chromium (Playwright), for the paper-form quotation (Gene, 27 Oct 2026: option B).
//   * One browser per server process, started on first use; each PDF gets its own context and is closed after.
//   * JavaScript is off and every network request is refused: the page is our own HTML (templates already sanitised),
//     images are data: URLs, so nothing in a document can run or reach the outside.
//   * Needs Chromium on the machine (`npx playwright install chromium`, already there for the e2e tests). Where it is
//     missing (e.g. a host without it) the route answers 503 pdf_unavailable; the HTML documents keep working.
import "server-only";
import { ApiError } from "./http";
import type { Browser } from "playwright-core";

const g = globalThis as unknown as { __lhdBrowser?: Promise<Browser> };

async function browser(): Promise<Browser> {
  if (!g.__lhdBrowser) {
    g.__lhdBrowser = import("playwright-core").then(p => p.chromium.launch({ headless: true }));
    g.__lhdBrowser.then(b => b.on("disconnected", () => { g.__lhdBrowser = undefined; }), () => { g.__lhdBrowser = undefined; });
  }
  try { return await g.__lhdBrowser; } catch { throw new ApiError(503, "pdf_unavailable"); }
}

const escAttr = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** A4 PDF; `label` is printed top right on every page as "<label> (Page x/y)", like the old system's printouts. */
export async function htmlToPdf(html: string, label: string, opts: { landscape?: boolean } = {}): Promise<Buffer> {
  const ctx = await (await browser()).newContext({ javaScriptEnabled: false });
  try {
    await ctx.route("**/*", r => r.request().url().startsWith("data:") ? r.continue() : r.abort());
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    return await page.pdf({
      format: "A4", landscape: !!opts.landscape, printBackground: true, displayHeaderFooter: true,
      margin: opts.landscape ? { top: "12mm", bottom: "8mm", left: "8mm", right: "8mm" } : { top: "14mm", bottom: "12mm", left: "10mm", right: "10mm" },
      headerTemplate: `<div style="width:100%;font-size:8px;font-weight:700;text-align:right;padding:0 6mm;font-family:Arial,sans-serif">${escAttr(label)} (Page <span class="pageNumber"></span>/<span class="totalPages"></span>)</div>`,
      footerTemplate: "<div></div>",
    });
  } finally { await ctx.close().catch(() => {}); }
}
