// The daily job board as a printable page, laid out like the "กระดานงาน" Excel (Gene, 27 Oct 2026): one table per section
// (department / โฆษณา or ละคร) with DATE, NO.ORDER, HOUSE, DOP, TITLE, LOC./TIME, GAFFER, HEAD, ELECTRICIAN, TRUCK, GEN, SALES,
// REMARK. A board entry wins; where a job has none, what the job itself says (autoFill) is printed. Drawn to PDF by
// lib/server/pdf.ts (landscape). Plain CommonJS so node tests can load it.
const GEN = /^(ultra silent\s+)?generator\b/i, VEHICLE = /truck|pick ?up|\bvan\b|รถ|6 ?wheel|10 ?wheel/i;
const posOf = l => { const d = String(l.desc ?? ""), i = d.indexOf(" · "); return (i < 0 ? d : d.slice(0, i)).trim(); };
const nameOf = l => { if (l.nick) return String(l.nick).trim(); const d = String(l.desc ?? ""), i = d.indexOf(" · ");
  const person = i < 0 ? "" : d.slice(i + 3); const nick = /\(([^)]+)\)\s*$/.exec(person); return (nick ? nick[1] : person || l.code || "").trim(); };
/** "Generator 45 KVA (7858) G17" → "G17 (7858)", "Lighting Pick Up 3 Ton (9467)P01" → "P01 (9467)"; otherwise the description. */
const unitOf = desc => { const d = String(desc ?? "").trim(), p = /\(([^)]+)\)/.exec(d), c = /([A-Za-z]{1,3}\.?\s?\d{1,4})\s*$/.exec(d.replace(/\([^)]*\)\s*$/, ""));
  return c && p ? `${c[1].replace(/\s/g, "")} (${p[1]})` : d; };
/** What a job's own lines say for each board column, written the way the Excel does (nicknames; "(Grip)", "(FL)").
 *  lines: the job's top-level lines with t, desc, code, qty and the crew member's nick. Nothing is guessed: drivers and
 *  vehicles are listed, not paired, except one generator driver with one generator. */
function autoFill(lines) {
  const crew = lines.filter(l => l.t === 5 || l.t === 7), used = new Set(), names = (ls, tag) => ls.map(l => nameOf(l) + (tag ? tag(l) : "")).filter(n => n && !used.has(n) && (used.add(n), true));
  const fl = l => (l.t === 7 ? "(FL)" : "");
  const is = re => l => re.test(posOf(l));
  const genDrivers = crew.filter(is(/gen\s*driver|generator/i)), drivers = crew.filter(l => !genDrivers.includes(l) && is(/driver|คนขับ/i)(l));
  const gaffer = names(crew.filter(l => is(/^gaffer/i)(l)), fl), head = names(crew.filter(l => is(/head\s*elec/i)(l) && !is(/asst/i)(l)), fl);
  const rest = names(crew.filter(l => !genDrivers.includes(l) && !drivers.includes(l)), l => (/grip/i.test(posOf(l)) ? "(Grip)" : "") + fl(l));
  const top = lines.filter(l => l.t === 4), gens = top.filter(l => GEN.test(String(l.desc ?? "").trim())).map(l => unitOf(l.desc)),
    vehicles = top.filter(l => !GEN.test(String(l.desc ?? "").trim()) && VEHICLE.test(String(l.desc ?? ""))).map(l => unitOf(l.desc));
  const gd = genDrivers.map(nameOf), dr = drivers.map(nameOf);
  return {
    gaffer: gaffer.join(" "), head: head.join(" "), crew: rest.join(" "),
    trucks: [dr.join(" "), vehicles.join(" ")].filter(Boolean).join("\n"),
    gens: gd.length === 1 && gens.length === 1 ? `${gd[0]} ${gens[0]}` : [gd.join(" "), gens.join(" ")].filter(Boolean).join("\n"),
  };
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DEPT = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };
const KIND = { ads: "โฆษณา", drama: "ละคร" };
const dm = s => { if (!s) return ""; const [, m, d] = String(s).slice(0, 10).split("-"); return `${+d}/${+m}`; };
const span = j => { const a = j.use_start || j.ship, b = j.use_end || j.ret; return a === b ? `${+String(a).slice(8, 10)}` : `${dm(a)}-${dm(b)}`; };
/** "เชอร์รี่" → "K.เชอร์รี่", as the Excel writes the sales person. */
const salesLabel = s => { const t = String(s ?? "").trim(); return !t ? "" : /^k\./i.test(t) ? t : `K.${t}`; };
const cell = v => v ? esc(v).replace(/\n/g, "<br>") : "";
/** The board value for a column: the day's entry, else what the job says (Gene: fill it from the job). */
const val = (j, k) => (j.entry && j.entry[k] != null ? j.entry[k] : j.entry ? "" : (j.auto && j.auto[k]) || "");

const CSS = `*{box-sizing:border-box}body{margin:0;padding:0 1px;font-family:"Sarabun","Thonburi","Tahoma",Arial,sans-serif;color:#111;font-size:9.5px}
h1{font-size:14px;margin:0 0 6px}h2{font-size:11px;margin:10px 0 3px;background:#f6f5f1;padding:3px 6px}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #111;padding:2px 3px;vertical-align:top;word-wrap:break-word}
th{background:#dfe1e3;font-size:9px}tr{break-inside:avoid}.g{color:#777}`;
const COLS = [["DATE", 5], ["NO.ORDER", 7], ["HOUSE", 9], ["DOP", 6], ["TITLE", 9], ["LOC./TIME.", 11], ["GAFFER", 6], ["HEAD", 6], ["ELECTRICIAN.", 11], ["TRUCK", 8], ["GEN", 7], ["SALES", 6], ["REMARK", 9]];

/** board: the GET /api/board result. dayLabel: e.g. "27/10/2026". */
function boardPage(board, dayLabel) {
  const groups = new Map();
  for (const j of board.jobs.filter(x => !x.odd)) { const key = `${DEPT[j.dept] || "—"} / ${KIND[j.section]}`; groups.set(key, [...(groups.get(key) || []), j]); }
  let h = `<h1>กระดานงาน · ${esc(dayLabel)}</h1>`;
  if (!board.jobs.some(x => !x.odd)) h += `<p>—</p>`;
  for (const [key, jobs] of groups) {
    h += `<h2>${esc(key)}</h2><table><colgroup>${COLS.map(([, w]) => `<col style="width:${w}%">`).join("")}</colgroup><thead><tr>${COLS.map(([c]) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    for (const j of jobs) {
      h += `<tr><td>${esc(span(j))}</td><td>${j.addition_of_no ? `Add&gt;${esc(j.no)}<br><span class="g">(${esc(j.addition_of_no)})</span>` : esc(j.no)}</td><td>${esc(j.customer_name)}</td><td>${esc(j.dop)}</td><td>${esc(j.job_title)}</td>`
        + `<td>${[val(j, "onloc"), val(j, "loc")].filter(Boolean).map(cell).join("<br>")}</td><td>${cell(val(j, "gaffer"))}</td><td>${cell(val(j, "head"))}</td><td>${cell(val(j, "crew"))}</td>`
        + `<td>${cell(val(j, "trucks"))}</td><td>${cell(val(j, "gens"))}</td><td>${esc(salesLabel(j.sale))}</td><td>${cell(val(j, "remark"))}</td></tr>`; }
    h += `</tbody></table>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Board ${esc(board.day)}</title><style>${CSS}</style></head><body>${h}</body></html>`;
}

module.exports = { boardPage, span, autoFill, unitOf, salesLabel };
