"use client";
// Settings: company details on documents (admin edits). Remark/footer templates and the sales list are shown by name;
// their content is rendered with the documents (M4 slice 4).
import { useEffect, useState } from "react";
import { Shell, api, useApp } from "../ui/app";

function Settings() {
  const { t, me } = useApp(); const [s, setS] = useState<any>(null); const [f, setF] = useState<any>({ name: "", tax: "", addr: "" }); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const load = () => api("GET", "/api/settings").then(r => { if (r.ok) { setS(r.body); setF({ name: r.body.company?.name ?? "Lighthouse Film Service", tax: r.body.company?.tax ?? "", addr: r.body.company?.addr ?? "" }); } });
  useEffect(() => { load(); }, []);
  const ed = me?.role === "admin";
  async function save(e: React.FormEvent) { e.preventDefault(); setErr(""); setMsg(""); const r = await api("PUT", "/api/settings/company", f);
    if (r.ok) { setMsg(t("saved")); load(); } else setErr(`${t(r.body?.error ?? "error")}${r.body?.message && r.body.message !== r.body.error ? " — " + r.body.message : ""}`); }
  if (!s) return <div className="empty"><p>{t("loading")}</p></div>;
  return (<>
    <div className="view-head"><h1>{t("setT")}</h1>{!ed && <span className="tag">{t("viewOnly")}</span>}</div>
    <form className="sec" onSubmit={save}><div className="grid">
      <label className="field span2"><span>{t("company")}</span><input className="inp" required disabled={!ed} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <label className="field"><span>{t("companyTax")}</span><input className="inp mono" inputMode="numeric" disabled={!ed} value={f.tax} onChange={e => setF({ ...f, tax: e.target.value.replace(/\D/g, "").slice(0, 13) })} /></label>
      <label className="field spanall"><span>{t("companyAddr")}</span><textarea className="inp" disabled={!ed} value={f.addr} onChange={e => setF({ ...f, addr: e.target.value })} /></label></div>
      {err && <div className="banner bad">{err}</div>}{msg && !err && <div className="good small">{msg}</div>}
      {ed && <div className="row"><button className="btn primary" type="submit">{t("save")}</button></div>}</form>
    <section className="sec"><h3>{t("remarks")}<small>{(s.remarks ?? []).length}</small></h3><ul className="log">{(s.remarks ?? []).map((r: any) => <li key={r.id}>{r.name}{r.def ? " ★" : ""}</li>)}</ul></section>
    <section className="sec"><h3>{t("footers")}<small>{(s.footers ?? []).length}</small></h3><ul className="log">{(s.footers ?? []).map((r: any) => <li key={r.id}>{r.name}{r.def ? " ★" : ""}</li>)}</ul></section>
    <section className="sec"><h3>{t("h_sale")}<small>{(s.sales ?? []).length}</small></h3><ul className="log">{(s.sales ?? []).map((r: any, i: number) => <li key={i}><b>{r.nick || r.code}</b> {r.code ? <span className="mono muted">{r.code}</span> : null}</li>)}</ul></section>
  </>);
}
export default function Page() { return <Shell wide={false}><Settings /></Shell>; }
