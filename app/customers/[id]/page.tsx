"use client";
// Customer: view, or edit for admin/sale. Flagged-new customers show why they were flagged and can be marked checked.
// The tax ID field only appears for roles allowed to see it (admin, sale, accounting).
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shell, api, useApp, stCls, fmtD } from "../../ui/app";

function Customer({ id }: { id: string }) {
  const { t, me } = useApp(); const router = useRouter(); const isNew = id === "new"; const ed = me?.role === "admin" || me?.role === "sale";
  const [f, setF] = useState<any>(isNew ? { name: "", code: "", jobType: "TVC", defaultDisc: 0, billing: "", phone: "", fax: "", taxId: "" } : null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const load = () => api("GET", `/api/customers/${encodeURIComponent(id)}`).then(r => r.ok ? setF(r.body) : setErr(t(r.body?.error ?? "error")));
  useEffect(() => { if (!isNew) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return err ? <div className="banner bad">{err}</div> : <div className="empty"><p>{t("loading")}</p></div>;
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const fail = (b: any) => setErr(b?.error === "stale" ? t("stale") : `${t(b?.error ?? "error")}${b?.message && b.message !== b.error ? " — " + b.message : ""}`);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    const body: any = { name: f.name, code: f.code, jobType: f.jobType, defaultDisc: +f.defaultDisc, billing: f.billing, phone: f.phone, fax: f.fax };
    if ("taxId" in f) body.taxId = f.taxId ?? "";
    const r = isNew ? await api("POST", "/api/customers", body) : await api("PATCH", `/api/customers/${encodeURIComponent(id)}`, { ...body, updatedAt: f.updatedAt });
    if (r.ok) { setMsg(t("saved")); if (isNew) router.replace(`/customers/${encodeURIComponent(r.body.id)}`); else load(); }
    else if (r.body?.error === "nothing_to_change") setMsg(t("saved")); else fail(r.body);
  }
  async function markChecked() { const r = await api("PATCH", `/api/customers/${encodeURIComponent(id)}`, { updatedAt: f.updatedAt, flaggedNew: false }); if (r.ok) load(); else fail(r.body); }
  const dis = !ed;
  return (<>
    <div className="row"><Link href="/customers" className="btn sm ghost">← {t("customers")}</Link>{!ed && <span className="tag">{t("viewOnly")}</span>}</div>
    <div className="view-head"><h1 style={{ fontSize: 26 }}>{isNew ? t("custNew") : f.name}</h1></div>
    {f.flaggedNew && <div className="banner" style={{ borderLeftColor: "var(--warn)" }}><b>{t("flaggedNew")}</b><div className="small">{f.flagNote}</div>
      {ed && <div style={{ marginTop: 6 }}><button className="btn sm primary" type="button" onClick={markChecked}>{t("markChecked")}</button></div>}</div>}
    {f.source === "v2" && !isNew && <div className="muted small">{t("tookOver")}</div>}
    <form className="sec" onSubmit={save}>
      <div className="grid">
        <label className="field"><span>{t("c_code")}</span><input className="inp" disabled={dis} value={f.code ?? ""} onChange={e => set("code", e.target.value)} /></label>
        <label className="field span2"><span>{t("c_name")}</span><input className="inp" required disabled={dis} value={f.name ?? ""} onChange={e => set("name", e.target.value)} /></label>
        {"taxId" in f && <label className="field"><span>{t("c_tax")}</span><input className="inp mono" inputMode="numeric" disabled={dis} value={f.taxId ?? ""} onChange={e => set("taxId", e.target.value.replace(/\D/g, "").slice(0, 13))} /></label>}
        <label className="field"><span>{t("c_type")}</span><select className="inp" disabled={dis} value={f.jobType ?? ""} onChange={e => set("jobType", e.target.value)}><option value="">{t("pick")}</option>{["CO-PRO", "FILM", "SP", "TVC", "TVD"].map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>{t("c_disc")}</span><input className="inp num" type="number" min={0} max={100} disabled={dis} value={f.defaultDisc ?? 0} onChange={e => set("defaultDisc", e.target.value)} /></label>
        <label className="field"><span>{t("c_phone")}</span><input className="inp" disabled={dis} value={f.phone ?? ""} onChange={e => set("phone", e.target.value)} /></label>
        <label className="field spanall"><span>{t("c_addr")}</span><textarea className="inp" disabled={dis} value={f.billing ?? ""} onChange={e => set("billing", e.target.value)} /></label>
      </div>
      {err && <div className="banner bad">{err}</div>}{msg && !err && <div className="good small">{msg}</div>}
      {ed && <div className="row"><button className="btn primary" type="submit">{isNew ? t("create") : t("save")}</button></div>}
    </form>
    {!isNew && f.jobs?.length > 0 && <section className="sec"><h3>{t("recentJobs")}</h3><div>{f.jobs.map((j: any) =>
      <Link key={j.id} href={`/jobs/${encodeURIComponent(j.id)}`} className="jrow" style={{ padding: "7px 0" }}><span className="mono">{j.no}</span><span className="t ellip">{j.job_title}</span><span className="c" /><span><span className={stCls(j.status)}>{j.status}</span></span><span className="d num">{fmtD(j.ship)}</span><span /></Link>)}</div></section>}
  </>);
}
export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Shell wide={false}><Customer id={decodeURIComponent(id)} /></Shell>; }
