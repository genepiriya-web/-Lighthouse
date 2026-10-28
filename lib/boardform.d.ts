export function boardPage(board: { day: string; jobs: any[] }, dayLabel: string): string;
export interface AutoFill { gaffer: string; head: string; crew: string; trucks: string; gens: string }
export function autoFill(lines: Array<{ t: number; desc?: string | null; code?: string | null; qty?: number; nick?: string | null }>): AutoFill;
export function unitOf(desc: unknown): string;
export function salesLabel(s: unknown): string;
export function groupAdds<T extends Record<string, any>>(jobs: T[]): Array<T & { adds: T[] }>;
export function addLabel(a: Record<string, any>): string;
export function span(j: { use_start?: string | null; use_end?: string | null; ship?: string | null; ret?: string | null }): string;
