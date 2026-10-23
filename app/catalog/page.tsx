"use client";
// Catalog list: search, type and department filters. Admin and store can add items (as on the artifact).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell, api, useApp, money } from "../ui/app";
import { TYPES } from "../../lib/logic";

const DEPT: Record<number, string> = { 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };
const typeName = (id: number) => { const k = TYPES.find(x => x.id === id)?.k ?? ""; return k ? k[0] + k.slice(1).toLowerCase() : ""; };

function Catalog() {
  const { t, me } = useApp(); const [q, setQ] = useState(""); const [type, setType] = useState(0); const [dept, setDept] = useState(0); const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { const h = setTimeout(() => api("GET", `/api/catalog?limit=300&q=${encodeURIComponent(q.trim())}${type ? `&type=${type}` : ""}${dept ? `&dept=${dept}` : ""}`).then(r => setRows(r.ok ? r.body.products : [])), 200); return () => clearTimeout(h); }, [q, type, dept]);
  return (<>
    <div className="view-head"><h1>{t("catT")}</h1>{(me?.role === "admin" || me?.role === "store") && <Link className="btn primary" href="/catalog/new">{t("itemNew")}</Link>}</div>
    <input className="inp" type="search" style={{ maxWidth: 460 }} placeholder={t("searchCat")} value={q} onChange={e => setQ(e.target.value)} />
    <div className="chips"><button type="button" className="chip" aria-pressed={type === 0} onClick={() => setType(0)}>{t("allTypes")}</button>
      {TYPES.filter(x => x.id !== 5 && x.id !== 7).map(x => <button key={x.id} type="button" className="chip" aria-pressed={type === x.id} onClick={() => setType(x.id)}>{typeName(x.id)}</button>)}</div>
    <div className="chips"><button type="button" className="chip" aria-pressed={dept === 0} onClick={() => setDept(0)}>{t("allDepts")}</button>
      {[1, 2, 3].map(d => <button key={d} type="button" className="chip" aria-pressed={dept === d} onClick={() => setDept(d)}>{DEPT[d]}</button>)}</div>
    {!rows ? <div className="empty"><p>{t("loading")}</p></div> : !rows.length ? <div className="empty"><p>{t("noMatch")}</p></div> :
      <div className="list">{rows.map(p => <Link key={p.id} href={`/catalog/${p.id}`} className="jrow crow">
        <span className="mono">{p.code}</span><span className="t">{p.desc}{p.kitParts ? <> <span className="tag">{t("kit")} {p.kitParts}</span></> : null}{p.source === "v2" ? <> <span className="tag">v2</span></> : null}</span>
        <span className="c">{typeName(p.type)} · {DEPT[p.dept] ?? ""}</span><span className="num d">฿{money(p.price)}{t("perDay")}</span><span className="num d">{t("stock")} {p.stock}</span></Link>)}</div>}
  </>);
}
export default function Page() { return <Shell><Catalog /></Shell>; }
