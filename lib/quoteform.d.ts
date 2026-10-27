import type { Line } from "../src/logic";
import type { DocOrder, DocContext } from "./docs";

export interface QuoteFormContext { company?: DocContext["company"]; remarks?: DocContext["remarks"]; footers?: DocContext["footers"];
  printedAt?: string; printedBy?: string; customerCode?: string | null; logo?: string | null; }
export function quoteForm(o: DocOrder, lines: Line[], disc: boolean, x?: QuoteFormContext): string;
export function pdfName(o: DocOrder, disc: boolean): string;
export function crewName(l: Line): { name: string; pos: string };
export function rowsOf(lines: Line[], t: number): Line[];
