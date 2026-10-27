"use client";
// Daily job board (Gene, 27 Oct 2026; replaces the "กระดานงาน" Excel and looks like it). Pick a day: every job working that
// day in the Excel's table — a band per section (department / โฆษณา or ละคร, month), then DATE, NO.ORDER, HOUSE, DOP, TITLE,
// LOC./TIME, GAFFER, HEAD, ELECTRICIAN, TRUCK, GEN, SALES, REMARK. Job columns come from the job; the crew, truck, generator
// and remark columns start from what the job's lines say and are typed over for the day (saved when you leave a cell).
// "Same as <day>" copies a job's last earlier entry. Jobs with implausible dates are listed apart. PDF prints the day.
import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Shell, api, useApp } from "../ui/app";
import { span, salesLabel } from "../../lib/boardform";

type Any = Record<string, any>;
const FIELDS = ["onloc", "loc", "gaffer", "head", "crew", "trucks", "gens", "remark"] as const;
type Field = typeof FIELDS[number];
const DEPT: Record<number, string> = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };
const MONTH_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const bkk = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const plus = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return bkk(new Date(Date.UTC(y, m - 1, d + n, 5))); };
const dmy = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const editable = (role?: string) => role === "admin" || role === "sale" || role === "store";
// column widths as in the Excel (px); the table scrolls sideways on narrow screens
const COLS: Array<[string, number]> = [["DATE", 64], ["NO.ORDER", 96], ["HOUSE", 120], ["DOP", 70], ["TITLE", 120], ["LOC./TIME.", 170], ["GAFFER", 80], ["HEAD", 70],
  ["ELECTRICIAN.", 190], ["TRUCK", 110], ["GEN", 110], ["SALES", 80], ["REMARK", 170]];
const css = `.bd-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
.bd{border-collapse:collapse;table-layout:fixed;min-width:${COLS.reduce((a, [, w]) => a + w, 0)}px;width:100%;font-size:12px}
.bd th,.bd td{border:1px solid #444;padding:0;vertical-align:middle;text-align:center}
.bd th{background:#c8b763;color:#111;font-weight:700;padding:4px 2px}.bd .band th{font-size:14px}
.bd td.ro{padding:4px 3px}.bd textarea{display:block;width:100%;border:0;background:transparent;resize:none;font:inherit;text-align:center;padding:4px 3px;min-height:34px;color:inherit;field-sizing:content}
.bd textarea:focus{outline:2px solid var(--accent);background:var(--surface)}.bd textarea:disabled{color:inherit;-webkit-text-fill-color:currentColor}
.bd td.rm textarea{text-align:left}.bd tr.auto textarea{color:#2b4fa8;-webkit-text-fill-color:#2b4fa8}.bd .no a{font-family:var(--f-mono)}`;

function Board() {
  const { t, me } = useApp(); const can = editable(me?.role);
  const [day, setDay] = useState(bkk()); const [b, setB] = useState<Any | null>(null); const [err, setErr] = useState("");
  const [ver, setVer] = useState(0); // bumped when cells must show fresh values (reload, copy); a plain save keeps the cursor where it is
  const load = useCallback(async () => { const r = await api("GET", `/api/board?day=${day}`); if (r.ok) { setB(r.body); setErr(""); setVer(v => v + 1); } else setErr(t(r.body?.error ?? "error")); }, [day, t]);
  useEffect(() => { setB(null); load(); }, [load]);

  const save = async (j: Any, patch: Partial<Record<Field, string>>, refresh = false) => {
    // the first edit of a day saves the whole row as shown, so the other cells keep what the job filled in
    const cur: Any = j.entry ?? j.auto ?? {}; const next = { ...Object.fromEntries(FIELDS.map(k => [k, cur[k] ?? ""])), ...patch };
    if (FIELDS.every(k => (next[k] ?? "") === (cur[k] ?? ""))) return;
    const r = await api("PUT", `/api/board/${encodeURIComponent(j.id)}/${day}`, { ...next, ...(j.entry && { updatedAt: new Date(j.entry.updated_at).toISOString() }) });
    if (r.ok) { setB((x: Any) => ({ ...x, jobs: x.jobs.map((y: Any) => y.id === j.id ? { ...y, entry: r.body.entry } : y) })); if (refresh) setVer(v => v + 1); }
    else { setErr(t(r.body?.error ?? "error")); if (r.status === 409) load(); }
  };

  const [y, m] = day.split("-").map(Number); const monthLabel = `${t("bd_month")} ${MONTH_TH[m - 1]} ${(y + 543) % 100}`;
  const groups = new Map<string, Any[]>();
  for (const j of (b?.jobs ?? []).filter((x: Any) => !x.odd)) { const k = `${DEPT[j.dept] ?? "—"} / ${t(j.section === "drama" ? "bd_drama" : "bd_ads")}`; groups.set(k, [...(groups.get(k) ?? []), j]); }
  const odd = (b?.jobs ?? []).filter((x: Any) => x.odd);

  return (<>
    <style>{css}</style>
    <div className="view-head"><h1>{t("board")}</h1></div>
    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
      <button className="btn" type="button" onClick={() => setDay(plus(day, -1))} aria-label={t("bd_prev")}>‹</button>
      <input className="inp" type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} style={{ width: "auto" }} aria-label={t("bd_day")} />
      <button className="btn" type="button" onClick={() => setDay(plus(day, 1))} aria-label={t("bd_next")}>›</button>
      <button className="btn ghost" type="button" onClick={() => setDay(bkk())}>{t("todayLbl")}</button>
      <a className="btn primary" href={`/api/board/pdf?day=${day}`} download>{t("download")} PDF</a>
      <span className="muted small">{t("bd_legend")}</span>
    </div>
    {err && <div className="banner bad">{err}</div>}
    {!b ? <div className="empty"><p>{t("loading")}</p></div> : !groups.size ? <div className="empty"><p>{t("bd_none", { d: dmy(day) })}</p></div> :
      <div className="bd-wrap"><table className="bd">
        <colgroup>{COLS.map(([c, w]) => <col key={c} style={{ width: w }} />)}</colgroup>
        <tbody>{[...groups].map(([k, jobs]) => <Fragment key={k}>
          <tr className="band"><th colSpan={COLS.length}>{k} {monthLabel}</th></tr>
          <tr>{COLS.map(([c]) => <th key={c}>{c}</th>)}</tr>
          {jobs.map(j => <Row key={`${j.id}-${day}-${ver}`} j={j} can={can} onSave={(p, refresh) => save(j, p, refresh)} />)}
        </Fragment>)}</tbody>
      </table></div>}
    {odd.length > 0 && <details className="sec"><summary className="small muted" style={{ cursor: "pointer" }}>{t("bd_odd", { n: odd.length })}</summary>
      <ul className="log">{odd.map((j: Any) => <li key={j.id}><Link href={`/jobs/${encodeURIComponent(j.id)}`} className="mono">#{j.no}</Link> {j.status} · {j.job_title} · {j.customer_name} · {span(j)}</li>)}</ul></details>}
  </>);
}

function Row({ j, can, onSave }: { j: Any; can: boolean; onSave: (p: Partial<Record<Field, string>>, refresh?: boolean) => void }) {
  const { t } = useApp(); const e: Any = j.entry ?? j.auto ?? {}; const fromJob = !j.entry;
  const cell = (k: Field) => <textarea aria-label={t("bd_" + k)} disabled={!can} defaultValue={e[k] ?? ""} maxLength={2000} onBlur={ev => onSave({ [k]: ev.target.value })} />;
  return <tr className={fromJob ? "auto" : ""}>
    <td className="ro">{span(j)}{can && fromJob && j.prev && <div><button className="btn sm ghost" type="button" title={t("bd_copy", { d: dmy(String(j.prev.day).slice(0, 10)) })}
      onClick={() => onSave(Object.fromEntries(FIELDS.map(k => [k, j.prev[k] ?? ""])), true)}>⧉</button></div>}</td>
    <td className="ro no">{j.addition_of_no ? <>Add&gt;<Link href={`/jobs/${encodeURIComponent(j.id)}`}>{j.no}</Link><div className="muted small">({j.addition_of_no})</div></> : <Link href={`/jobs/${encodeURIComponent(j.id)}`}>{j.no}</Link>}
      <div className="muted small">{j.status}</div></td>
    <td className="ro">{j.customer_name}</td><td className="ro">{j.dop}</td><td className="ro">{j.job_title}</td>
    <td>{cell("onloc")}{cell("loc")}</td><td>{cell("gaffer")}</td><td>{cell("head")}</td><td>{cell("crew")}</td><td>{cell("trucks")}</td><td>{cell("gens")}</td>
    <td className="ro">{salesLabel(j.sale)}</td><td className="rm">{cell("remark")}</td>
  </tr>;
}

export default function Page() { return <Shell wide><Board /></Shell>; }
