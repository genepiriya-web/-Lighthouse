"use client";
// Repairs: tickets created from check-in. Store and admin move them through wait → doing → done (or lost).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell, api, useApp, fmtD } from "../ui/app";

const ST: Array<[string, string]> = [["wait", "rp_wait"], ["doing", "rp_doing"], ["done", "rp_done"], ["lost", "rp_lost"]];
interface Ticket { id: string; at: string; code: string | null; desc: string | null; qty: number; status: string; note: string | null; orderNo: string | null; orderId: string | null; }

function Repairs() {
  const { t, me } = useApp(); const can = me?.role === "admin" || me?.role === "store";
  const [list, setList] = useState<Ticket[] | null>(null); const [f, setF] = useState(""); const [err, setErr] = useState("");
  const load = () => api("GET", `/api/repairs${f ? `?status=${f}` : ""}`).then(r => setList(r.ok ? r.body.repairs : []));
  useEffect(() => { load(); }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (id: string, body: Record<string, string>) => { const r = await api("PATCH", `/api/repairs/${id}`, body); if (!r.ok) setErr(t(r.body?.error ?? "error")); else { setErr(""); load(); } };
  return (
    <>
      <div className="view-head"><h1>{t("repT")}</h1></div>
      <div className="chips"><button type="button" className="chip" aria-pressed={f === ""} onClick={() => setF("")}>{t("f_all")}</button>
        {ST.map(([s, k]) => <button key={s} type="button" className="chip" aria-pressed={f === s} onClick={() => setF(s)}>{t(k)}</button>)}</div>
      {err && <div className="banner bad">{err}</div>}
      {!list ? <div className="empty"><p>{t("loading")}</p></div> : !list.length ? <div className="empty"><p>{t("noRepairs")}</p></div> :
        <div className="list">{list.map(r => (
          <div key={r.id} className="jrow rrow">
            <span className="num d">{fmtD(r.at)}</span>
            <span className="t"><b className="mono">{r.code}</b> {r.desc}</span>
            <span className="num">× {r.qty}</span>
            <span className="d">{r.orderId ? <Link href={`/jobs/${encodeURIComponent(r.orderId)}`} className="mono">{r.orderNo}</Link> : null}</span>
            <span>{can ? <select className="inp" value={r.status} onChange={e => save(r.id, { status: e.target.value })}>{ST.map(([s, k]) => <option key={s} value={s}>{t(k)}</option>)}</select> : t(ST.find(x => x[0] === r.status)?.[1] ?? "rp_wait")}</span>
            <span className="c">{can ? <input className="inp" placeholder={t("h_note")} defaultValue={r.note ?? ""} key={r.id + (r.note ?? "")} onBlur={e => e.target.value !== (r.note ?? "") && save(r.id, { note: e.target.value })} /> : r.note}</span>
          </div>))}</div>}
    </>
  );
}

export default function Page() { return <Shell><Repairs /></Shell>; }
