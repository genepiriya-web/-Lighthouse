"use client";
// Store day view: what goes out (Order/Approve) and what comes back (Shipped) in the next 7 days, overdue marked.
// Same lists as the artifact's Store tab, over every open job — legacy and v2.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell, api, useApp, stCls, fmtD } from "../ui/app";

const DEPT: Record<number, string> = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };
const bkk = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const plus = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return bkk(new Date(Date.UTC(y, m - 1, d + n, 5))); };

function Store() {
  const { t } = useApp(); const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api("GET", "/api/orders?status=open&limit=500").then(r => setRows(r.ok ? r.body.orders : [])); }, []);
  if (!rows) return <div className="empty"><p>{t("loading")}</p></div>;
  const today = bkk(), wk = plus(today, 7);
  const out = rows.filter(o => ["Order", "Approve"].includes(o.status) && o.ship && o.ship <= wk).sort((a, b) => a.ship.localeCompare(b.ship));
  const back = rows.filter(o => o.status === "Shipped" && o.ret && o.ret <= wk).sort((a, b) => a.ret.localeCompare(b.ret));
  const list = (rs: any[], dk: "ship" | "ret") => !rs.length ? <p className="muted">{t("nothing")}</p> : <div className="list">{rs.map(o => { const d = o[dk];
    return <Link key={o.id} href={`/jobs/${encodeURIComponent(o.id)}`} className="jrow">
      <span className={`num ${d < today ? "bad" : ""}`}>{fmtD(d)}{d < today ? ` · ${t("overdue")}` : d === today ? ` · ${t("todayLbl")}` : ""}</span>
      <span className="t ellip">{o.job_title}</span><span className="c ellip">{o.customer_name}</span><span><span className={stCls(o.status)}>{o.status}</span></span>
      <span className="d">{o.dept ? DEPT[o.dept] : ""}</span><span className="mono d" style={{ textAlign: "right" }}>{o.no}</span></Link>; })}</div>;
  return (<>
    <div className="view-head"><h1>{t("storeT")}</h1></div>
    <section className="sec"><h3>{t("outToday")}<small>{t("next7")} · {out.length}</small></h3>{list(out, "ship")}</section>
    <section className="sec"><h3>{t("backToday")}<small>{t("next7")} · {back.length}</small></h3>{list(back, "ret")}</section>
  </>);
}
export default function Page() { return <Shell><Store /></Shell>; }
