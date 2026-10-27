"use client";
// Daily job board (Gene, 27 Oct 2026; replaces the "กระดานงาน" Excel). Pick a day: every job working that day, grouped like
// the Excel (department / โฆษณา or ละคร). For each job, what the job already knows is shown, and the board entry for the day
// is typed in: location and time, head, electricians, trucks with drivers, generators with operators, remark. A field saves
// when you leave it. "Same as <day>" copies the job's last earlier entry. Print gives the day as a landscape PDF.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Shell, api, useApp, stCls } from "../ui/app";

type Any = Record<string, any>;
const FIELDS = ["onloc", "loc", "head", "crew", "trucks", "gens", "remark"] as const;
type Field = typeof FIELDS[number];
const DEPT: Record<number, string> = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };
const bkk = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const plus = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return bkk(new Date(Date.UTC(y, m - 1, d + n, 5))); };
const dmy = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const editable = (role?: string) => role === "admin" || role === "sale" || role === "store";

function Board() {
  const { t, me } = useApp(); const can = editable(me?.role);
  const [day, setDay] = useState(bkk()); const [b, setB] = useState<Any | null>(null); const [err, setErr] = useState("");
  const [ver, setVer] = useState(0); // bumped when fields must show fresh values (reload, copy); a plain save keeps the cursor where it is
  const load = useCallback(async () => { const r = await api("GET", `/api/board?day=${day}`); if (r.ok) { setB(r.body); setErr(""); setVer(v => v + 1); } else setErr(t(r.body?.error ?? "error")); }, [day, t]);
  useEffect(() => { setB(null); load(); }, [load]);

  const save = async (j: Any, patch: Partial<Record<Field, string>>, refresh = false) => {
    const cur: Any = j.entry ?? {}; const next = { ...Object.fromEntries(FIELDS.map(k => [k, cur[k] ?? ""])), ...patch };
    if (FIELDS.every(k => (next[k] ?? "") === (cur[k] ?? ""))) return;
    const r = await api("PUT", `/api/board/${encodeURIComponent(j.id)}/${day}`, { ...next, ...(j.entry && { updatedAt: new Date(j.entry.updated_at).toISOString() }) });
    if (r.ok) { setB((x: Any) => ({ ...x, jobs: x.jobs.map((y: Any) => y.id === j.id ? { ...y, entry: r.body.entry } : y) })); if (refresh) setVer(v => v + 1); }
    else { setErr(t(r.body?.error ?? "error")); if (r.status === 409) load(); }
  };

  const groups = new Map<string, Any[]>();
  for (const j of b?.jobs ?? []) { const k = `${DEPT[j.dept] ?? "—"} / ${t(j.section === "drama" ? "bd_drama" : "bd_ads")}`; groups.set(k, [...(groups.get(k) ?? []), j]); }

  return (<>
    <div className="view-head"><h1>{t("board")}</h1></div>
    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
      <button className="btn" type="button" onClick={() => setDay(plus(day, -1))} aria-label={t("bd_prev")}>‹</button>
      <input className="inp" type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} style={{ width: "auto" }} aria-label={t("bd_day")} />
      <button className="btn" type="button" onClick={() => setDay(plus(day, 1))} aria-label={t("bd_next")}>›</button>
      <button className="btn ghost" type="button" onClick={() => setDay(bkk())}>{t("todayLbl")}</button>
      <a className="btn primary" href={`/api/board/pdf?day=${day}`} download>{t("download")} PDF</a>
    </div>
    {err && <div className="banner bad">{err}</div>}
    {!b ? <div className="empty"><p>{t("loading")}</p></div> : !b.jobs.length ? <div className="empty"><p>{t("bd_none", { d: dmy(day) })}</p></div> : null}
    {[...groups].map(([k, jobs]) => <section key={k} className="sec"><h3>{k}<small>{jobs.length}</small></h3>
      {jobs.map(j => <Row key={`${j.id}-${day}-${ver}`} j={j} can={can} day={day} onSave={(p, refresh) => save(j, p, refresh)} />)}
    </section>)}
  </>);
}

function Row({ j, can, onSave }: { j: Any; can: boolean; day: string; onSave: (p: Partial<Record<Field, string>>, refresh?: boolean) => void }) {
  const { t } = useApp(); const e: Any = j.entry ?? {};
  const hint: Partial<Record<Field, string>> = { crew: j.fromJob.crew.join(", "), trucks: j.fromJob.trucks.join(", "), gens: j.fromJob.gens.join(", "), remark: j.note ?? "" };
  const empty = FIELDS.every(k => !e[k]);
  const field = (k: Field, wide = false) => <label key={k} className={`field ${wide ? "span2" : ""}`}><span>{t("bd_" + k)}</span>
    <textarea className="inp" rows={k === "crew" || k === "remark" ? 2 : 1} disabled={!can} defaultValue={e[k] ?? ""} placeholder={hint[k] || ""} maxLength={2000}
      onBlur={ev => onSave({ [k]: ev.target.value })} /></label>;
  return <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
    <div className="row" style={{ flexWrap: "wrap", gap: 6, minWidth: 0 }}>
      <Link href={`/jobs/${encodeURIComponent(j.id)}`} className="mono">#{j.no}</Link>
      {j.addition_of_no && <span className="muted small">{t("bd_addOf", { n: j.addition_of_no })}</span>}
      <span className={stCls(j.status)}>{j.status}</span>
      <b className="ellip" style={{ minWidth: 0 }}>{j.job_title || "—"}</b>
      <span className="muted small">{[j.customer_name, j.dop && `DOP ${j.dop}`, j.sale && `${t("h_sale")} ${j.sale}`, j.gaffer && `Gaffer ${j.gaffer}`].filter(Boolean).join(" · ")}</span>
    </div>
    <div className="grid">{field("onloc")}{field("loc", true)}{field("head")}{field("crew", true)}{field("trucks")}{field("gens")}{field("remark", true)}</div>
    {can && empty && j.prev && <div><button className="btn sm" type="button" onClick={() => onSave(Object.fromEntries(FIELDS.map(k => [k, j.prev[k] ?? ""])), true)}>{t("bd_copy", { d: dmy(String(j.prev.day).slice(0, 10)) })}</button></div>}
    {e.updated_by_name && <div className="muted small">{t("bd_saved", { n: e.updated_by_name })}</div>}
  </div>;
}

export default function Page() { return <Shell><Board /></Shell>; }
