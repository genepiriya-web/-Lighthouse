"use client";
// Customers: search, new customers to check first (flagged by the importer), add (admin, sale).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell, api, useApp } from "../ui/app";

function Customers() {
  const { t, me } = useApp(); const [q, setQ] = useState(""); const [flagged, setFlagged] = useState(false); const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { const h = setTimeout(() => api("GET", `/api/customers?limit=300&q=${encodeURIComponent(q.trim())}${flagged ? "&flagged=1" : ""}`).then(r => setRows(r.ok ? r.body.customers : [])), 200); return () => clearTimeout(h); }, [q, flagged]);
  return (<>
    <div className="view-head"><h1>{t("custT")}</h1>{(me?.role === "admin" || me?.role === "sale") && <Link className="btn primary" href="/customers/new">{t("custNew")}</Link>}</div>
    <input className="inp" type="search" style={{ maxWidth: 460 }} placeholder={t("searchCustName")} value={q} onChange={e => setQ(e.target.value)} />
    <div className="chips"><button type="button" className="chip" aria-pressed={!flagged} onClick={() => setFlagged(false)}>{t("f_all")}</button>
      <button type="button" className="chip" aria-pressed={flagged} onClick={() => setFlagged(true)}><span className="dot" style={{ background: "var(--warn)" }} />{t("flaggedOnly")}</button></div>
    {!rows ? <div className="empty"><p>{t("loading")}</p></div> : !rows.length ? <div className="empty"><p>{t("noMatch")}</p></div> :
      <div className="list">{rows.map(c => <Link key={c.id} href={`/customers/${encodeURIComponent(c.id)}`} className="jrow crow">
        <span className="mono">{c.code ?? "—"}</span><span className="t">{c.name}{c.flaggedNew ? <> <span className="tag" style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>{t("flaggedNew")}</span></> : null}</span>
        <span className="c">{c.jobType ?? ""}</span><span className="num d">{c.defaultDisc ? `${c.defaultDisc}%` : ""}</span><span className="d">{c.phone ?? ""}</span></Link>)}</div>}
  </>);
}
export default function Page() { return <Shell><Customers /></Shell>; }
