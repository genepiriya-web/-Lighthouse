"use client";
// Crew rates by position — view only, as on the artifact. Cost columns appear only for admin and the crew manager.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell, api, useApp, money } from "../ui/app";

const DEPT: Record<number, string> = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };
function Crew() {
  const { t, me } = useApp(); const [q, setQ] = useState(""); const [rows, setRows] = useState<any[] | null>(null);
  const isAdmin = me?.role === "admin"; const [ids, setIds] = useState<Record<string, string>>({}); const [shown, setShown] = useState<Record<string, string>>({});
  useEffect(() => { if (isAdmin) api("GET", "/api/crew-ids").then(r => r.ok && setIds(r.body.masked)); }, [isAdmin]);
  // Each "Show" asks the server for the full ID (logged there) and hides it again after 30 seconds.
  const reveal = async (crewId: string) => { const r = await api("POST", `/api/crew-ids/${encodeURIComponent(crewId)}/reveal`, {});
    if (r.ok) { setShown(s => ({ ...s, [crewId]: r.body.id })); setTimeout(() => setShown(s => { const n = { ...s }; delete n[crewId]; return n; }), 30_000); } };
  useEffect(() => { const h = setTimeout(() => api("GET", `/api/crew-rates?q=${encodeURIComponent(q.trim())}`).then(r => setRows(r.ok ? r.body.rates : [])), 200); return () => clearTimeout(h); }, [q]);
  const cost = rows?.some(r => "cost" in r);
  return (<>
    <div className="view-head"><h1>{t("crewT")}</h1><div className="row"><span className="tag">{t("viewOnly")}</span>{isAdmin && <Link className="btn" href="/crew/ids">{t("idsImport")}</Link>}</div></div>
    {isAdmin && <p className="muted small" style={{ margin: 0 }}>{t("idsCount", { n: Object.keys(ids).length })} · {t("idsPrivacyV2")}</p>}
    <input className="inp" type="search" style={{ maxWidth: 460 }} placeholder={t("searchCrew")} value={q} onChange={e => setQ(e.target.value)} />
    {!rows ? <div className="empty"><p>{t("loading")}</p></div> : !rows.length ? <div className="empty"><p>{t("noMatch")}</p></div> :
      <><p className="muted small">{rows.length.toLocaleString()}</p>
      <div className="list">{rows.map((r, i) => <div key={`${r.crewId}-${r.positionId}-${r.rateNo}`} className="jrow crow" style={r.enabled && r.rateEnabled ? undefined : { opacity: .55 }}>
        <span className="mono">{r.posCode}</span>
        <span className="t">{r.posName} <span className="muted">· {r.name || r.nick}{r.nick && r.name && r.name !== r.nick ? ` (${r.nick})` : ""}</span>{r.needsReview ? <> <span className="tag" style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>{t("rateCheck")}</span></> : null}</span>
        <span className="c">{DEPT[r.dept] ?? ""}</span>
        <span className="num d">{t("p_price")} ฿{money(r.price)} · {t("p_ot")} ฿{money(r.priceOt)}</span>
        <span className="num d">{cost ? `${t("p_cost")} ฿${money(r.cost)} · OT ฿${money(r.costOt)}` : ""}
          {isAdmin && ids[r.crewId] && rows.findIndex(x => x.crewId === r.crewId) === i ? <span className="row" style={{ gap: 4 }}><span className="mono">{shown[r.crewId] ?? ids[r.crewId]}</span>
            {!shown[r.crewId] && <button className="btn sm ghost" type="button" onClick={() => reveal(r.crewId)}>{t("show")}</button>}</span> : null}</span></div>)}</div></>}
  </>);
}
export default function Page() { return <Shell><Crew /></Shell>; }
