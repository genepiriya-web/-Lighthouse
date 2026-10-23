"use client";
// CEO Cockpit (admin): problems, money and equipment from logic.js diagnose() over all open jobs — the artifact's Cockpit.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell, api, useApp, money, fmtD } from "../ui/app";

const PK: Record<string, [string, "high" | "med" | "low"]> = { overbook: ["pk_overbook", "high"], overdue: ["pk_overdue", "high"], crew: ["pk_crew", "high"], discount: ["pk_discount", "high"],
  mismatch: ["pk_mismatch", "high"], stale: ["pk_stale", "med"], missing: ["pk_missing", "med"], price: ["pk_price", "low"], adjust: ["pk_adjust", "low"] };
const tone = (s: string) => s === "high" ? "var(--danger)" : s === "med" ? "var(--warn)" : "var(--muted)";
const Bar = ({ v, max }: { v: number; max: number }) => <div style={{ height: 6, background: "var(--sunk)", borderRadius: 3 }}><div style={{ height: 6, width: `${max > 0 ? Math.max(2, Math.round(100 * v / max)) : 0}%`, background: "var(--accent)", borderRadius: 3 }} /></div>;

function Cockpit() {
  const { t, me, lang } = useApp(); const [R, setR] = useState<any>(null); const [err, setErr] = useState(""); const [sec, setSec] = useState("problems"); const [filter, setFilter] = useState("all");
  const load = () => { setR(null); api("GET", "/api/cockpit").then(r => r.ok ? setR(r.body) : setErr(t(r.body?.error ?? "error"))); };
  useEffect(() => { if (me?.role === "admin") load(); }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (me?.role !== "admin") return <div className="banner bad">{t("rRole")}</div>;
  const head = <><div className="view-head"><h1>{t("cockpit")}</h1><div className="row"><span className="muted small">{t("dataAsOf")} {R?.asOf ? new Date(R.asOf).toLocaleString(lang === "th" ? "th-TH" : "en-GB") : "—"}</span>
    <button className="btn sm" type="button" onClick={load}>{t("refresh")}</button></div></div>
    <div className="seg" role="tablist">{["problems", "money", "assets"].map(k => <button key={k} type="button" aria-pressed={sec === k} onClick={() => setSec(k)}>{t("k_" + k)}</button>)}</div></>;
  if (err) return <>{head}<div className="banner bad">{err}</div></>;
  if (!R) return <>{head}<div className="empty"><p>{t("loading")}</p></div></>;
  const job = (no: string) => { const o = R.owners[no]; return o ? <Link key={no} className="btn sm ghost mono" href={`/jobs/${encodeURIComponent(o.id)}`}>{no}</Link> : <span key={no} className="mono">{no}</span>; };
  const who = (p: any) => { const o = p.no ? R.owners[p.no] : null; return o?.customerName ? ` · ${o.customerName}` : ""; };
  const text = (p: any) => { switch (p.kind) {
    case "overbook": return t("d_overbook", { code: p.code, desc: p.desc, need: p.need, stock: p.stock, from: fmtD(p.from), to: fmtD(p.to) });
    case "overdue": return t("d_overdue", { d: fmtD(p.ret), n: p.days }) + who(p);
    case "stale": return t("d_stale", { s: p.status, d: fmtD(p.ret), n: p.days }) + who(p);
    case "mismatch": return t("d_mismatch", { a: money(p.legacy), b: money(p.lines) });
    case "adjust": return t("d_adjust", { a: money(p.adjust) }) + who(p);
    case "missing": return t("d_missing", { m: p.miss.join(", ") });
    case "discount": return p.lines.map((l: any) => `${l.code} ${l.disc}% (${l.rule})`).join(" · ") + who(p);
    case "price": return p.lines.slice(0, 4).map((l: any) => `${l.code} ${money(l.list)} vs ${money(l.catalog)}`).join(" · ") + (p.lines.length > 4 ? ` +${p.lines.length - 4}` : "") + who(p);
    case "crew": return t("d_crew", { n: p.name, from: fmtD(p.from), to: fmtD(p.to) }); } return ""; };

  if (sec === "money") { const M = R.money; const sales = Object.entries(M.bySale as Record<string, any>).filter(([, v]) => v.jobs).sort((a, b) => b[1].net - a[1].net); const mx = Math.max(...sales.map(([, v]) => v.net), 1);
    const cust = Object.entries(M.byCustomer as Record<string, any>).sort((a, b) => b[1].net - a[1].net).slice(0, 12); const mc = Math.max(...cust.map(([, v]) => v.net), 1);
    const tile = (k: string, o: any, tc: string) => <div className="stat" style={{ ["--tc" as string]: `var(${tc})`, cursor: "default" }}><b className="num" style={{ fontSize: 22 }}>฿{Math.round(o.value).toLocaleString()}</b><span>{t(k)} · {o.n} {t("jobsN")}</span></div>;
    return <>{head}<div className="stats">{tile("m_quotes", M.quotes, "--s-quote")}{tile("m_confirmed", M.confirmed, "--s-order")}{tile("m_onrent", M.onRent, "--s-shipped")}{tile("m_tobill", M.toBill, "--s-returned")}</div>
      <p className="muted small">{t("exVat")}</p>
      <section className="sec"><h3>{t("m_bySale")}<small>{t("m_bySaleNote")}</small></h3>{sales.map(([k, v]) => { const pct = v.list ? Math.round(100 * v.disc / v.list) : 0;
        return <div key={k} className="jrow crow" style={{ padding: "6px 0" }}><span><b>{k}</b></span><span className="num">{v.jobs} {t("jobsN")} · ฿{money(v.net)}</span><span className="c"><Bar v={v.net} max={mx} /></span>
          <span className={`num d ${pct >= 60 ? "bad" : pct >= 45 ? "warn" : ""}`}>{t("m_avgDisc")} {pct}%</span><span /></div>; })}</section>
      <section className="sec"><h3>{t("m_topCust")}</h3>{cust.map(([k, v]) => <div key={k} className="jrow crow" style={{ padding: "6px 0" }}><span className="t" style={{ gridColumn: "span 2" }}>{k}</span>
        <span className="num">{v.jobs} {t("jobsN")} · ฿{money(v.net)}</span><span className="c"><Bar v={v.net} max={mc} /></span><span /></div>)}</section></>; }

  if (sec === "assets") { const A = R.assets; const rows = (rs: any[], f: (r: any) => string) => rs.length ? rs.map((r, i) => <div key={i} className="jrow crow" style={{ padding: "6px 0" }}>
      <span className="mono">{r.code}</span><span className="t">{r.desc}</span><span /><span className="num d">{f(r)}</span><span /></div>) : <p className="muted">—</p>;
    return <>{head}<section className="sec"><h3>{t("a_top")}<small>{t("a_topNote")}</small></h3>{rows(A.top, r => `${r.jobs} ${t("jobsN")} · ฿${money(r.net)}`)}</section>
      <section className="sec"><h3>{t("a_sub")}<small>{t("a_subNote")}</small></h3>{rows(A.subrent, r => `${r.jobs} ${t("jobsN")} · ฿${money(r.net)}`)}</section>
      <section className="sec"><h3>{t("a_idle")}<small>{t("a_idleNote", { n: A.idleCount })}</small></h3>{rows(A.idleTop, r => `× ${r.stock} · ฿${money(r.price)}${t("perDay")}`)}</section></>; }

  const cnt: Record<string, number> = {}; for (const p of R.problems) cnt[p.kind] = (cnt[p.kind] || 0) + 1;
  const rank = { high: 0, med: 1, low: 2 }; const list = R.problems.filter((p: any) => filter === "all" || p.kind === filter).sort((a: any, b: any) => rank[PK[a.kind][1]] - rank[PK[b.kind][1]]);
  return <>{head}
    <div className="stats">{Object.keys(PK).filter(k => cnt[k]).map(k => <button key={k} type="button" className="stat" style={{ ["--tc" as string]: tone(PK[k][1]) }} aria-pressed={filter === k} onClick={() => setFilter(k)}><b>{cnt[k]}</b><span>{t(PK[k][0])}</span></button>)}
      <button type="button" className="stat" aria-pressed={filter === "all"} onClick={() => setFilter("all")}><b>{R.problems.length}</b><span>{t("f_all")}</span></button></div>
    {!R.problems.length ? <div className="empty"><h2>{t("noProblems")}</h2></div> :
      <div className="list">{list.map((p: any, i: number) => <div key={i} className="jrow prow">
        <span><span className="tag" style={{ borderColor: tone(PK[p.kind][1]), color: tone(PK[p.kind][1]) }}>{t(PK[p.kind][0])}</span></span>
        <span className="row" style={{ gap: 2 }}>{(p.no ? [p.no] : p.nos || []).map(job)}</span><span className="t">{text(p)}</span></div>)}</div>}
    <p className="muted small">{t("cockNoteV2")}</p></>;
}
export default function Page() { return <Shell><Cockpit /></Shell>; }
