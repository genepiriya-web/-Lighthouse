// The quotation as a PDF in the company's paper-form layout (lib/quoteform.js → lib/server/pdf.ts). Any staff, like the
// HTML documents. The logo is assets/logo.png (or .svg) when that file exists; without it the form prints the name.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import type { Caller } from "./auth";
import { getOrder } from "./orders";
import { getSettings } from "./master";
import { fromRow } from "../docs";
import { quoteForm, pdfName, type QuoteView } from "../quoteform";
import { htmlToPdf } from "./pdf";

let logoCache: string | null | undefined;
function logo(): string | null {
  if (logoCache !== undefined) return logoCache;
  logoCache = null;
  for (const [f, type] of [["logo.png", "image/png"], ["logo.svg", "image/svg+xml"]] as const) {
    try { logoCache = `data:${type};base64,${fs.readFileSync(path.join(process.cwd(), "assets", f)).toString("base64")}`; break; } catch { /* not there */ }
  }
  return logoCache;
}

const bangkokNow = () => new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour12: false }).replace(",", "");

/** Reads inside the caller's transaction; the PDF itself is drawn after, outside it (`render`). */
export async function quoteFormFor(c: PoolClient, who: Caller, id: string, view: QuoteView) {
  const { order, lines } = await getOrder(c, id); const s = await getSettings(c); const o = fromRow(order);
  const code = order.customer_id ? (await c.query("select code from customers where id = $1", [order.customer_id])).rows[0]?.code ?? null : null;
  const html = quoteForm(o, lines, view, { company: s.company, remarks: s.remarks, footers: s.footers, printedAt: bangkokNow(), printedBy: who.name, customerCode: code, logo: logo() });
  return { html, name: pdfName(o, view), label: `${o.no}-${String(o.rev || 0).padStart(3, "0")}` };
}

export const render = (f: { html: string; label: string }) => htmlToPdf(f.html, f.label);
