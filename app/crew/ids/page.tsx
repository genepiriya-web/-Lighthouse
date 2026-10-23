"use client";
// Admin: import crew national IDs from a paste or a CSV/text file. Check first (IDs shown masked), then save — the
// server stores them encrypted. One crew per line: crew code (or the old system's crew number, or full name), then the ID.
import { useState } from "react";
import Link from "next/link";
import { Shell, api, useApp } from "../../ui/app";

function Import() {
  const { t, me } = useApp(); const [text, setText] = useState(""); const [res, setRes] = useState<any>(null); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  if (me?.role !== "admin") return <div className="banner bad">{t("rRole")}</div>;
  const run = async (save: boolean) => { setErr(""); setMsg(""); const r = await api("POST", "/api/crew-ids/import", { text, save });
    if (!r.ok) { setErr(t(r.body?.error ?? "error")); return; } setRes(r.body); if (save) { setMsg(t("idsSaved", { n: r.body.saved })); setText(""); } };
  const why = (w: string) => t(w === "nomatch" ? "ids_nomatch" : w === "checksum" ? "ids_checksum" : w === "cols" ? "ids_cols" : "ids_ambiguous");
  return (<>
    <div className="row"><Link href="/crew" className="btn sm ghost">← {t("crew")}</Link></div>
    <div className="view-head"><h1>{t("idsImport")}</h1></div>
    <p className="muted" style={{ margin: 0 }}>{t("idsHelp")}</p><p className="muted small" style={{ margin: 0 }}>{t("idsPrivacyV2")}</p>
    <section className="sec">
      <textarea className="inp mono" style={{ minHeight: 160 }} placeholder="G01, x-xxxx-xxxxx-xx-x" value={text} onChange={e => { setText(e.target.value); setRes(null); }} />
      <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async e => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setRes(null); } e.target.value = ""; }} />
      <div className="row"><button className="btn" type="button" disabled={!text.trim()} onClick={() => run(false)}>{t("idsPreview")}</button>
        {res && res.ready > 0 && <button className="btn primary" type="button" onClick={() => run(true)}>{t("idsSave", { n: res.ready })}</button>}</div>
      {err && <div className="banner bad">{err}</div>}{msg && <div className="good">{msg}</div>}
      {res && !msg && <ul className="log">{res.rows.map((r: any) => <li key={r.line}><span className="mono muted">#{r.line}</span> <b>{r.key}</b> {r.crewName ? `→ ${r.crewName}` : ""} ·{" "}
        {r.ok ? <span className="good mono">{r.masked}</span> : <span className="bad">{why(r.why)}</span>}</li>)}</ul>}
    </section>
  </>);
}
export default function Page() { return <Shell wide={false}><Import /></Shell>; }
