"use client";
// Sign in with an emailed 6-digit code (stays in the app on a phone) or Google, through Supabase Auth.
// Who may use the app is decided by the server: invited emails join with their role on first sign-in.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../ui/app";
import { supabase } from "../../lib/supabase-browser";

export default function SignIn() {
  const { t, lang, setLang } = useApp(); const router = useRouter(); const sb = supabase();
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [sent, setSent] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => { e.preventDefault(); if (!sb) return; setErr(""); setBusy(true);
    const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase() }); setBusy(false); if (error) setErr(error.message); else setSent(true); };
  const verify = async (e: React.FormEvent) => { e.preventDefault(); if (!sb) return; setErr(""); setBusy(true);
    const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" }); setBusy(false);
    if (error) setErr(error.message); else { router.push("/jobs"); router.refresh(); } };
  const google = async () => { if (!sb) return; const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/jobs` } }); if (error) setErr(error.message); };
  return (
    <main className="wrap pad" style={{ maxWidth: 440 }}>
      <div className="view-head"><h1>{t("signIn")}</h1><button className="btn sm" type="button" onClick={() => setLang(lang === "th" ? "en" : "th")}>{lang === "th" ? "EN" : "ไทย"}</button></div>
      {!sb ? <div className="banner bad">{t("authOff")}</div> : <>
        <p className="muted" style={{ margin: 0 }}>{t("signInHelp")}</p>
        {!sent ? <form className="sec" onSubmit={send}><label className="field"><span>{t("emailLbl")}</span><input className="inp" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <button className="btn primary" type="submit" disabled={busy}>{t("sendCode")}</button></form>
        : <form className="sec" onSubmit={verify}><p className="small" style={{ margin: 0 }}>{t("codeSent", { e: email })}</p>
          <label className="field"><span>{t("codeLbl")}</span><input className="inp mono" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <button className="btn primary" type="submit" disabled={busy}>{t("verifyCode")}</button></form>}
        <div className="muted small" style={{ textAlign: "center" }}>{t("orLbl")}</div>
        <button className="btn" type="button" onClick={google}>{t("withGoogle")}</button>
        {err && <div className="banner bad">{err}</div>}</>}
    </main>
  );
}
