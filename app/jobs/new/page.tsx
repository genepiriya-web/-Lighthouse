"use client";
// New job (sale, admin). Picks the customer by id from search, so billing and phone fill from the customer record.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, api, useApp } from "../../ui/app";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

function NewJob() {
  const { t } = useApp(); const router = useRouter();
  const [f, setF] = useState<Record<string, string>>({ rentType: "Daily", tax: "Vat", ship: today(), ret: today() });
  const [cq, setCq] = useState(""); const [hits, setHits] = useState<Array<{ id: string; name: string; code: string | null; flaggedNew: boolean }>>([]);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (cq.trim().length < 2 || f.customerName === cq) { setHits([]); return; }
    const h = setTimeout(() => api("GET", `/api/customers?q=${encodeURIComponent(cq.trim())}`).then(r => r.ok && setHits(r.body.customers)), 200); return () => clearTimeout(h); }, [cq, f.customerName]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const body: Record<string, unknown> = { ...f }; if (f.dept) body.dept = +f.dept; if (f.dpw) body.dpw = +f.dpw;
    for (const k of Object.keys(body)) if (body[k] === "") delete body[k];
    const r = await api("POST", "/api/orders", body); setBusy(false);
    if (r.ok) router.push(`/jobs/${encodeURIComponent(r.body.id)}`); else setErr(t(r.body?.error ?? "error"));
  }
  return (
    <>
      <div className="view-head"><h1>{t("newOrderT")}</h1></div>
      <form className="sec" onSubmit={submit}>
        <div className="grid">
          <label className="field span2"><span>{t("h_cust")}</span>
            <input className="inp" value={cq} autoComplete="off" onChange={e => { setCq(e.target.value); setF({ ...f, customerId: "", customerName: "" }); }} placeholder={t("searchCustName")} />
            {hits.length > 0 && <div className="results">{hits.map(h => <button key={h.id} type="button" className="res btn ghost" style={{ justifyContent: "space-between", borderRadius: 0 }}
              onClick={() => { setF({ ...f, customerId: h.id, customerName: h.name }); setCq(h.name); setHits([]); }}><span>{h.name}</span><span className="muted small">{h.code}{h.flaggedNew ? ` · ${t("flaggedNew")}` : ""}</span></button>)}</div>}
          </label>
          <label className="field span2"><span>{t("h_title")}</span><input className="inp" value={f.jobTitle ?? ""} onChange={set("jobTitle")} /></label>
          <label className="field"><span>{t("h_jt")}</span><select className="inp" value={f.jobType ?? ""} onChange={set("jobType")}><option value="">{t("pick")}</option>{["CO-PRO", "FILM", "SP", "TVC", "TVD"].map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="field"><span>{t("h_dept")}</span><select className="inp" value={f.dept ?? ""} onChange={set("dept")}><option value="">{t("pick")}</option><option value="1">LIGHTING</option><option value="2">GRIP</option><option value="3">GRIP&LIGHTING</option></select></label>
          <label className="field"><span>{t("h_ship")}</span><input className="inp" type="date" value={f.ship ?? ""} onChange={set("ship")} /></label>
          <label className="field"><span>{t("h_ret")}</span><input className="inp" type="date" value={f.ret ?? ""} onChange={set("ret")} /></label>
          <label className="field"><span>{t("h_type")}</span><select className="inp" value={f.rentType} onChange={set("rentType")}><option>Daily</option><option>Weekly</option></select></label>
          {f.rentType === "Weekly" && <label className="field"><span>{t("h_dpw")}</span><input className="inp" type="number" min={0} max={7} value={f.dpw ?? ""} onChange={set("dpw")} /></label>}
          <label className="field"><span>{t("h_tax")}</span><select className="inp" value={f.tax} onChange={set("tax")}><option>Vat</option><option>Not Vat</option></select></label>
          <label className="field"><span>{t("h_dop")}</span><input className="inp" value={f.dop ?? ""} onChange={set("dop")} /></label>
          <label className="field"><span>{t("h_sale")}</span><input className="inp" value={f.sale ?? ""} onChange={set("sale")} /></label>
        </div>
        {err && <div className="banner bad">{err}</div>}
        <div className="row"><button className="btn primary" type="submit" disabled={busy}>{t("create")}</button><button className="btn" type="button" onClick={() => router.push("/jobs")}>{t("cancel")}</button></div>
      </form>
    </>
  );
}

export default function Page() { return <Shell wide={false}><NewJob /></Shell>; }
