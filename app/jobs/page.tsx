"use client";
// Jobs list: open jobs by status (same counters as the artifact), search, and closed jobs on request. A search goes to the
// server and covers every job (10,000+ since the history import of 3 Nov 2026), within the status picked, if any.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Shell, api, useApp, stCls, money, fmtD } from "../ui/app";

const OPEN = ["Quote", "Order", "Approve", "Store Add", "Shipped", "Returned"];
const DEPT: Record<number, string> = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };
interface Row { id: string; no: string; owner: string; status: string; customer_name: string | null; job_title: string | null; job_type: string | null; dept: number | null; ship: string | null; ret: string | null; dop: string | null; totals: { sub: number; extra: number; adj?: number } | null; }

function Jobs() {
  const { t, me } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null); const [filter, setFilter] = useState("open"); const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Row[] | null>(null); const [found, setFound] = useState<Row[] | null>(null);
  useEffect(() => { api("GET", "/api/orders?status=open&limit=500").then(r => setRows(r.ok ? r.body.orders : [])); }, []);
  useEffect(() => { if (filter === "Draft INV" || filter === "Cancel") api("GET", `/api/orders?status=${encodeURIComponent(filter)}&limit=500`).then(r => setClosed(r.ok ? r.body.orders : [])); }, [filter]);
  useEffect(() => {
    if (!q.trim()) { setFound(null); return; }
    let live = true; setFound(null);
    const tm = setTimeout(() => api("GET", `/api/orders?q=${encodeURIComponent(q.trim())}&limit=300${filter === "open" ? "" : `&status=${encodeURIComponent(filter)}`}`)
      .then(r => { if (live) setFound(r.ok ? r.body.orders : []); }), 250);
    return () => { live = false; clearTimeout(tm); };
  }, [q, filter]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows ?? []) c[r.status] = (c[r.status] || 0) + 1; return c; }, [rows]);
  const src = q.trim() ? found : filter === "Draft INV" || filter === "Cancel" ? closed : rows;
  const list = (src ?? []).filter(r => q.trim() || filter === "open" || filter === "Draft INV" || filter === "Cancel" || r.status === filter);
  const net = (r: Row) => r.totals ? money(r.totals.sub - r.totals.extra + (r.totals.adj || 0)) : "–";
  return (
    <>
      <div className="view-head"><h1>{t("jobs")}</h1>{(me?.role === "admin" || me?.role === "sale") && <Link className="btn primary" href="/jobs/new">{t("newOrder")}</Link>}</div>
      <input className="inp" type="search" style={{ maxWidth: 460 }} placeholder={t("searchJobs")} aria-label={t("search")} value={q} onChange={e => setQ(e.target.value)} />
      <div className="stats">
        {OPEN.map(s => <button key={s} type="button" className={`stat st-${s}`} aria-pressed={filter === s} onClick={() => setFilter(s)}><b>{counts[s] || 0}</b><span>{s}</span></button>)}
        <button type="button" className="stat" aria-pressed={filter === "open"} onClick={() => setFilter("open")}><b>{rows?.length ?? 0}</b><span>{t("openOnly")}</span></button>
      </div>
      <div className="chips">{["Draft INV", "Cancel"].map(s => <button key={s} type="button" className="chip" aria-pressed={filter === s} onClick={() => setFilter(s)}><span className={`dot st-${s.split(" ")[0]}`} style={{ background: "var(--tc)" }} />{s}</button>)}</div>
      {!src ? <div className="empty"><p>{t("loading")}</p></div> : !list.length ? <div className="empty"><p>{t("noMatch")}</p></div> :
        <div className="list">
          <div className="jrow head"><span>{t("c_no")}</span><span>{t("c_title")}</span><span>{t("c_cust")}</span><span>{t("c_status")}</span><span>{t("c_ship")}</span><span className="r" style={{ textAlign: "right" }}>{t("c_sub")}</span></div>
          {list.slice(0, 600).map(r => (
            <Link key={r.id} href={`/jobs/${encodeURIComponent(r.id)}`} className="jrow">
              <span className="mono">{r.no}{r.owner === "legacy" && <> <span className="tag">{t("legacy")}</span></>}</span>
              <span className="t ellip" title={r.job_title ?? ""}>{r.job_title || "—"}</span>
              <span className="c ellip">{r.customer_name}{r.dept ? ` · ${DEPT[r.dept]}` : ""}</span>
              <span><span className={stCls(r.status)}>{r.status}</span></span>
              <span className="d num">{fmtD(r.ship)}{r.ret ? `–${fmtD(r.ret)}` : ""}</span>
              <span className="num" style={{ textAlign: "right" }}>{net(r)}</span>
            </Link>))}
        </div>}
    </>
  );
}

export default function Page() { return <Shell><Jobs /></Shell>; }
