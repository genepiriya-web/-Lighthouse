import type { Line } from "../src/logic";

export type DocKind = "quote" | "draft" | "items";
export interface DocOrder { no: string; rev?: number; customerName?: string | null; billing?: string | null; phone?: string | null; fax?: string | null; contact?: string | null; contactPhone?: string | null;
  jobTitle?: string | null; jobType?: string | null; dept?: number | null; ship?: string | null; ret?: string | null; useStart?: string | null; useEnd?: string | null; dop?: string | null;
  sale?: string | null; tax?: string; extraDisc?: number; insurance?: number; adjust?: number; remarkId?: string | null; footerId?: string | null; }
export interface DocContext { company?: { name?: string; tax?: string | null; addr?: string | null } | null; remarks?: Array<{ id: string | number; html: string }>; footers?: Array<{ id: string | number; html: string }>; today: string; }

export function sanitizeHtml(html: string): string;
export function docBody(o: DocOrder, lines: Line[], kind: DocKind, disc: boolean, ctx: DocContext): string;
export function docFile(o: DocOrder, lines: Line[], kind: DocKind, disc: boolean, ctx: DocContext): string;
export function docName(o: DocOrder, kind: DocKind, disc: boolean): string;
export function fromRow(row: Record<string, any>): DocOrder;
