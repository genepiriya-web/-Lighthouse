"use client";
// Crew rates by position — view only, as on the artifact. Cost columns appear only for admin and the crew manager.
import { useEffect, useState } from "react";
import { Shell, api, useApp, money } from "../ui/app";

const DEPT: Record<number, string> = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };
function Crew() {
  const { t } = useApp(); const [q, setQ] = useState(""); const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { const h = setTimeout(() => api("GET", `/api/crew-rates?q=${encodeURIComponent(q.trim())}`).then(r => setRows(r.ok ? r.body.rates : [])), 200); return () => clearTimeout(h); }, [q]);
  const cost = rows?.some(r => "cost" in r);
  return (<>
    <div className="view-head"><h1>{t("crewT")}</h1><span className="tag">{t("viewOnly")}</span></div>
    <input className="inp" type="search" style={{ maxWidth: 460 }} placeholder={t("searchCrew")} value={q} onChange={e => setQ(e.target.value)} />
    {!rows ? <div className="empty"><p>{t("loading")}</p></div> : !rows.length ? <div className="empty"><p>{t("noMatch")}</p></div> :
      <><p className="muted small">{rows.length.toLocaleString()}</p>
      <div className="list">{rows.map(r => <div key={`${r.crewId}-${r.positionId}-${r.rateNo}`} className="jrow crow" style={r.enabled && r.rateEnabled ? undefined : { opacity: .55 }}>
        <span className="mono">{r.posCode}</span>
        <span className="t">{r.posName} <span className="muted">· {r.name || r.nick}{r.nick && r.name && r.name !== r.nick ? ` (${r.nick})` : ""}</span>{r.needsReview ? <> <span className="tag" style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>{t("rateCheck")}</span></> : null}</span>
        <span className="c">{DEPT[r.dept] ?? ""}</span>
        <span className="num d">{t("p_price")} ฿{money(r.price)} · {t("p_ot")} ฿{money(r.priceOt)}</span>
        <span className="num d">{cost ? `${t("p_cost")} ฿${money(r.cost)} · OT ฿${money(r.costOt)}` : ""}</span></div>)}</div></>}
  </>);
}
export default function Page() { return <Shell><Crew /></Shell>; }
