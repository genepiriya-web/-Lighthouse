"use client";
// Local test sign-in: pick a made-up staff member (scripts/dev-staff.js). Only works when the server runs with
// LHD_AUTH=dev against a local database; real sign-in arrives with Supabase (M6).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApp } from "../ui/app";

export default function DevLogin() {
  const { t, lang, setLang } = useApp(); const router = useRouter();
  const [staff, setStaff] = useState<Array<{ id: string; name: string; role: string }> | null>(null); const [off, setOff] = useState(false);
  const [needPin, setNeedPin] = useState(false); const [pin, setPin] = useState(""); const [pinErr, setPinErr] = useState("");
  const load = () => api("GET", "/api/dev/staff").then(r => { if (r.ok) { setStaff(r.body.staff); setNeedPin(false); } else if (r.body?.error === "pin_required") setNeedPin(true); else setOff(true); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Staff trial: the PIN is the sign-in (it names the department), so go straight in.
  const sendPin = async (e: React.FormEvent) => { e.preventDefault(); setPinErr(""); const r = await api("POST", "/api/dev/pin", { pin });
    if (r.ok) { router.push("/jobs"); router.refresh(); } else setPinErr(t(r.body?.error ?? "error")); };
  const pick = (id: string) => { document.cookie = `lhd_dev_user=${encodeURIComponent(id)}; path=/; samesite=lax`; router.push("/jobs"); router.refresh(); };
  return (
    <main className="wrap pad" style={{ maxWidth: 520 }}>
      <div className="view-head"><h1>{t("signInAs")}</h1><button className="btn sm" type="button" onClick={() => setLang(lang === "th" ? "en" : "th")}>{lang === "th" ? "EN" : "ไทย"}</button></div>
      <p className="muted">{t("devOnly")}</p>
      {needPin ? <form className="sec" onSubmit={sendPin}><h3>{t("pinTitle")}</h3><p className="muted small" style={{ margin: 0 }}>{t("pinHelp")}</p>
          <input className="inp mono" inputMode="numeric" autoComplete="off" required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
          <button className="btn primary" type="submit">{t("signIn")}</button>{pinErr && <div className="banner bad">{pinErr}</div>}</form>
      : off ? <div className="banner bad">{t("signedOut")}</div> : !staff ? <p className="muted">{t("loading")}</p> :
        <div className="list">{staff.map(s => (
          <button key={s.id} type="button" className="person btn ghost" style={{ width: "100%", justifyContent: "space-between", borderRadius: 0, padding: "12px 14px" }} onClick={() => pick(s.id)}>
            <span className="nm">{s.name}</span><span className="tape" style={{ ["--tc" as string]: "var(--sunk)", ["--tf" as string]: "var(--ink)" }}>{t("r_" + s.role)}</span></button>))}</div>}
      {(staff || needPin) && <section className="sec"><h3>{t("tryTitle")}</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{(needPin ? ["sale", "store", "support", "accounting", "admin"] : ["sale", "store", "accounting", "admin", "crew"]).map(r =>
        <li key={r} style={{ marginBottom: 6 }}><b>{t(r === "support" ? "dept_support" : "r_" + r)}</b> · {t("try_" + r)}</li>)}</ul><p className="small warn" style={{ margin: 0 }}>{t("privacyNote")}</p></section>}
    </main>
  );
}
