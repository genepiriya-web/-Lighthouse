"use client";
// Local test sign-in: pick a made-up staff member (scripts/dev-staff.js). Only works when the server runs with
// LHD_AUTH=dev against a local database; real sign-in arrives with Supabase (M6).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApp } from "../ui/app";

export default function DevLogin() {
  const { t, lang, setLang } = useApp(); const router = useRouter();
  const [staff, setStaff] = useState<Array<{ id: string; name: string; role: string }> | null>(null); const [off, setOff] = useState(false);
  useEffect(() => { api("GET", "/api/dev/staff").then(r => r.ok ? setStaff(r.body.staff) : setOff(true)); }, []);
  const pick = (id: string) => { document.cookie = `lhd_dev_user=${encodeURIComponent(id)}; path=/; samesite=lax`; router.push("/jobs"); router.refresh(); };
  return (
    <main className="wrap pad" style={{ maxWidth: 520 }}>
      <div className="view-head"><h1>{t("signInAs")}</h1><button className="btn sm" type="button" onClick={() => setLang(lang === "th" ? "en" : "th")}>{lang === "th" ? "EN" : "ไทย"}</button></div>
      <p className="muted">{t("devOnly")}</p>
      {off ? <div className="banner bad">{t("signedOut")}</div> : !staff ? <p className="muted">{t("loading")}</p> :
        <div className="list">{staff.map(s => (
          <button key={s.id} type="button" className="person btn ghost" style={{ width: "100%", justifyContent: "space-between", borderRadius: 0, padding: "12px 14px" }} onClick={() => pick(s.id)}>
            <span className="nm">{s.name}</span><span className="tape" style={{ ["--tc" as string]: "var(--sunk)", ["--tf" as string]: "var(--ink)" }}>{t("r_" + s.role)}</span></button>))}</div>}
    </main>
  );
}
