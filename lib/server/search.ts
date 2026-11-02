// Free-text search for the list and picker screens (Gene, 2 Nov 2026: "no bugs in item search"). Every typed word must
// appear in one of the columns, in any order: 222 of the 3,275 old-system item names have double spaces and crew first
// and last names are separate columns, so matching the whole typed text as one piece missed them. % and _ are matched as
// themselves, not as wildcards.
const MAX_WORDS = 8;

export const words = (q: unknown) => String(q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
const likeArg = (w: string) => `%${w.replace(/[\\%_]/g, m => "\\" + m)}%`;

/** SQL that is true when every word of `q` is in one of `cols` (args are appended), or null when `q` has no words. */
export function wordsMatch(cols: string[], q: unknown, args: unknown[]): string | null {
  const ws = words(q); if (!ws.length) return null;
  return ws.map(w => { args.push(likeArg(w)); const p = `$${args.length}`; return `(${cols.map(col => `${col} ilike ${p}`).join(" or ")})`; }).join(" and ");
}
