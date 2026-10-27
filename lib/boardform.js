// The daily job board as a printable page, laid out like the "กระดานงาน" Excel (Gene, 27 Oct 2026): one table per section
// (department / โฆษณา or ละคร) with DATE, NO.ORDER, HOUSE, DOP, TITLE, LOC./TIME, GAFFER, HEAD, ELECTRICIAN, TRUCK, GEN, SALES,
// REMARK. A board entry wins; where a job has none, what the job itself knows is printed in grey. Drawn to PDF by
// lib/server/pdf.ts (landscape). Plain CommonJS so node tests can load it.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DEPT = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };
const KIND = { ads: "โฆษณา", drama: "ละคร" };
const dm = s => { if (!s) return ""; const [, m, d] = String(s).slice(0, 10).split("-"); return `${+d}/${+m}`; };
const span = j => { const a = j.use_start || j.ship, b = j.use_end || j.ret; return a === b ? `${+String(a).slice(8, 10)}` : `${dm(a)}-${dm(b)}`; };
const cell = (v, fallback) => v ? esc(v).replace(/\n/g, "<br>") : fallback && fallback.length ? `<span class="g">${esc(fallback.join("\n")).replace(/\n/g, "<br>")}</span>` : "";

const CSS = `*{box-sizing:border-box}body{margin:0;padding:0 1px;font-family:"Sarabun","Thonburi","Tahoma",Arial,sans-serif;color:#111;font-size:9.5px}
h1{font-size:14px;margin:0 0 6px}h2{font-size:11px;margin:10px 0 3px;background:#f6f5f1;padding:3px 6px}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #111;padding:2px 3px;vertical-align:top;word-wrap:break-word}
th{background:#dfe1e3;font-size:9px}tr{break-inside:avoid}.g{color:#777}`;
const COLS = [["DATE", 5], ["NO.ORDER", 7], ["HOUSE", 9], ["DOP", 6], ["TITLE", 9], ["LOC./TIME.", 11], ["GAFFER", 6], ["HEAD", 6], ["ELECTRICIAN.", 11], ["TRUCK", 8], ["GEN", 7], ["SALES", 6], ["REMARK", 9]];

/** board: the GET /api/board result. dayLabel: e.g. "27/10/2026". */
function boardPage(board, dayLabel) {
  const groups = new Map();
  for (const j of board.jobs) { const key = `${DEPT[j.dept] || "—"} / ${KIND[j.section]}`; groups.set(key, [...(groups.get(key) || []), j]); }
  let h = `<h1>กระดานงาน · ${esc(dayLabel)}</h1>`;
  if (!board.jobs.length) h += `<p>—</p>`;
  for (const [key, jobs] of groups) {
    h += `<h2>${esc(key)}</h2><table><colgroup>${COLS.map(([, w]) => `<col style="width:${w}%">`).join("")}</colgroup><thead><tr>${COLS.map(([c]) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    for (const j of jobs) { const e = j.entry || {};
      h += `<tr><td>${esc(span(j))}</td><td>${j.addition_of_no ? `Add&gt;${esc(j.no)}<br><span class="g">(${esc(j.addition_of_no)})</span>` : esc(j.no)}</td><td>${esc(j.customer_name)}</td><td>${esc(j.dop)}</td><td>${esc(j.job_title)}</td>`
        + `<td>${[e.onloc, e.loc].filter(Boolean).map(x => esc(x).replace(/\n/g, "<br>")).join("<br>")}</td><td>${esc(j.gaffer)}</td><td>${cell(e.head)}</td><td>${cell(e.crew, j.fromJob.crew)}</td>`
        + `<td>${cell(e.trucks, j.fromJob.trucks)}</td><td>${cell(e.gens, j.fromJob.gens)}</td><td>${esc(j.sale)}</td><td>${cell(e.remark || j.note)}</td></tr>`; }
    h += `</tbody></table>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Board ${esc(board.day)}</title><style>${CSS}</style></head><body>${h}</body></html>`;
}

module.exports = { boardPage, span };
