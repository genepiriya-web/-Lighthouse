"use client";
// Catalog item: view, or edit for admin/store. Package parts editable with a part search. "new" creates an item.
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shell, api, useApp, money } from "../../ui/app";
import { TYPES } from "../../../lib/logic";

type Part = { id: number; ratio: number; price: number; code: string; desc: string };
function Item({ id }: { id: string }) {
  const { t, me } = useApp(); const router = useRouter(); const isNew = id === "new"; const ed = me?.role === "admin" || me?.role === "store";
  const [f, setF] = useState<any>(isNew ? { code: "", desc: "", type: 1, dept: 1, price: 0, discountable: true, maxDisc: 0, stock: 0, kit: [] } : null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [pq, setPq] = useState(""); const [hits, setHits] = useState<any[]>([]);
  const load = () => api("GET", `/api/catalog/${id}`).then(r => r.ok ? setF(r.body) : setErr(t(r.body?.error ?? "error")));
  useEffect(() => { if (!isNew) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pq.trim().length < 2) { setHits([]); return; } const h = setTimeout(() => api("GET", `/api/catalog?limit=20&q=${encodeURIComponent(pq.trim())}`).then(r => r.ok && setHits(r.body.products)), 200); return () => clearTimeout(h); }, [pq]);
  if (!f) return err ? <div className="banner bad">{err}</div> : <div className="empty"><p>{t("loading")}</p></div>;
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const kit: Part[] = f.kit ?? [];
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    const body: any = { code: f.code, desc: f.desc, type: +f.type, dept: +f.dept, price: +f.price, discountable: !!f.discountable, maxDisc: +f.maxDisc, stock: +f.stock, kit: kit.map(k => [k.id, +k.ratio, +k.price]) };
    const r = isNew ? await api("POST", "/api/catalog", body) : await api("PATCH", `/api/catalog/${id}`, { ...body, updatedAt: f.updatedAt });
    if (r.ok) { setMsg(t("saved")); if (isNew) router.replace(`/catalog/${r.body.id}`); else load(); }
    else setErr(r.body?.error === "stale" ? t("stale") : r.body?.error === "nothing_to_change" ? t("saved") : `${t(r.body?.error ?? "error")}${r.body?.message && r.body.message !== r.body.error ? " — " + r.body.message : ""}`);
  }
  const dis = !ed;
  return (<>
    <div className="row"><Link href="/catalog" className="btn sm ghost">← {t("catalog")}</Link>{!ed && <span className="tag">{t("viewOnly")}</span>}</div>
    <div className="view-head"><h1 style={{ fontSize: 26 }}>{isNew ? t("itemNew") : `${f.code} · ${f.desc}`}</h1></div>
    {f.source === "v2" && !isNew && <div className="muted small">{t("tookOver")}</div>}
    <form className="sec" onSubmit={save}>
      <div className="grid">
        <label className="field"><span>{t("i_code")}</span><input className="inp" required disabled={dis} value={f.code} onChange={e => set("code", e.target.value)} /></label>
        <label className="field span2"><span>{t("i_desc")}</span><input className="inp" required disabled={dis} value={f.desc} onChange={e => set("desc", e.target.value)} /></label>
        <label className="field"><span>{t("typeLbl")}</span><select className="inp" disabled={dis} value={f.type} onChange={e => set("type", +e.target.value)}>{TYPES.filter(x => x.id !== 5 && x.id !== 7).map(x => <option key={x.id} value={x.id}>{x.k}</option>)}</select></label>
        <label className="field"><span>{t("c_dept")}</span><select className="inp" disabled={dis} value={f.dept} onChange={e => set("dept", +e.target.value)}><option value={1}>LIGHTING</option><option value={2}>GRIP</option><option value={3}>GRIP&LIGHTING</option></select></label>
        <label className="field"><span>{t("price")}</span><input className="inp num" type="number" min={0} step="0.01" disabled={dis} value={f.price} onChange={e => set("price", e.target.value)} /></label>
        <label className="field"><span>{t("discountable")}</span><select className="inp" disabled={dis} value={f.discountable ? "1" : "0"} onChange={e => set("discountable", e.target.value === "1")}><option value="1">{t("yes")}</option><option value="0">{t("no")}</option></select></label>
        <label className="field"><span>{t("maxDisc")}</span><input className="inp num" type="number" min={0} max={100} disabled={dis} value={f.maxDisc} onChange={e => set("maxDisc", e.target.value)} /></label>
        <label className="field"><span>{t("stock")}</span><input className="inp num" type="number" min={0} step={1} disabled={dis} value={f.stock} onChange={e => set("stock", e.target.value)} /></label>
      </div>
      <h3>{t("kit")}<small>{kit.length}</small></h3>
      {kit.map((k, i) => <div key={k.id} className="lrow" style={{ gridTemplateColumns: "minmax(0,1fr) 80px 90px auto" }}>
        <span className="desc"><b>{k.code}</b>{k.desc}</span>
        <label><span className="lbl">{t("ratio")}</span><input className="inp cell num" type="number" min={0} step="any" disabled={dis} value={k.ratio} onChange={e => set("kit", kit.map((x, j) => j === i ? { ...x, ratio: e.target.value } : x))} /></label>
        <label><span className="lbl">{t("price")}</span><input className="inp cell num" type="number" min={0} step="0.01" disabled={dis} value={k.price} onChange={e => set("kit", kit.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} /></label>
        <span>{ed && <button className="btn sm ghost" type="button" aria-label={t("remove")} onClick={() => set("kit", kit.filter((_, j) => j !== i))}>✕</button>}</span></div>)}
      {ed && <div className="field"><span>{t("addPart")}</span><input className="inp" type="search" placeholder={t("searchCat")} value={pq} onChange={e => setPq(e.target.value)} />
        {hits.length > 0 && <div className="results">{hits.filter(h => String(h.id) !== String(f.id) && !kit.some(k => k.id === h.id)).map(h => <div key={h.id} className="res"><span><b className="mono">{h.code}</b> {h.desc} <span className="muted small">฿{money(h.price)}</span></span>
          <button className="btn sm" type="button" onClick={() => { set("kit", [...kit, { id: h.id, ratio: 1, price: 0, code: h.code, desc: h.desc }]); setPq(""); setHits([]); }}>+</button></div>)}</div>}</div>}
      {err && <div className="banner bad">{err}</div>}{msg && !err && <div className="good small">{msg}</div>}
      {ed && <div className="row"><button className="btn primary" type="submit">{isNew ? t("create") : t("save")}</button></div>}
    </form>
  </>);
}
export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Shell wide={false}><Item id={id} /></Shell>; }
