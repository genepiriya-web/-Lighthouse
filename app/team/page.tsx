"use client";
// Team (admin): change roles or switch people off — never yourself. Adding people comes with real sign-in (M6).
import { useEffect, useState } from "react";
import { Shell, api, useApp } from "../ui/app";

const ROLES = ["admin", "sale", "store", "accounting", "crew"];
function Team() {
  const { t, me } = useApp(); const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState("");
  const load = () => api("GET", "/api/staff").then(r => r.ok ? setRows(r.body.staff) : setErr(t(r.body?.error ?? "error")));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (id: string, b: any) => { const r = await api("PATCH", `/api/staff/${id}`, b); if (!r.ok) setErr(t(r.body?.error ?? "error")); else { setErr(""); load(); } };
  if (me?.role !== "admin") return <div className="banner bad">{t("rRole")}</div>;
  return (<>
    <div className="view-head"><h1>{t("team")}</h1></div>
    <p className="muted" style={{ margin: 0 }}>{t("addPeopleLater")}</p>
    {err && <div className="banner bad">{err}</div>}
    <section className="sec"><h3>{t("members")}<small>{rows?.length ?? ""}</small></h3>
      {!rows ? <p className="muted">{t("loading")}</p> : rows.map(r => { const self = r.id === me?.id; return <div key={r.id} className="person" style={r.active ? undefined : { opacity: .55 }}>
        <span className="nm"><b>{r.name}</b>{self ? <span className="muted small"> · {t("you")}</span> : null}</span>
        <select className="inp" style={{ width: "auto" }} disabled={self} value={r.role} onChange={e => save(r.id, { role: e.target.value })}>{ROLES.map(x => <option key={x} value={x}>{t("r_" + x)}</option>)}</select>
        <label className="small row" style={{ gap: 4 }}><input type="checkbox" disabled={self} checked={r.active} onChange={e => save(r.id, { active: e.target.checked })} />{t("activeLbl")}</label></div>; })}
    </section>
    <Invites />
    <section className="sec"><h3>{t("roleGuide")}</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{ROLES.map(r => <li key={r}><b>{t("r_" + r)}</b> · {t("g_" + r)}</li>)}</ul></section>
  </>);
}
function Invites() {
  const { t } = useApp(); const [list, setList] = useState<any[]>([]); const [f, setF] = useState({ email: "", role: "sale", name: "" }); const [err, setErr] = useState("");
  const load = () => api("GET", "/api/staff/invites").then(r => r.ok && setList(r.body.invites));
  useEffect(() => { load(); }, []);
  const add = async (e: React.FormEvent) => { e.preventDefault(); setErr(""); const r = await api("POST", "/api/staff/invites", f);
    if (r.ok) { setF({ email: "", role: f.role, name: "" }); load(); } else setErr(`${t(r.body?.error ?? "error")}${r.body?.message && r.body.message !== r.body.error ? " — " + r.body.message : ""}`); };
  return <section className="sec"><h3>{t("invites")}</h3><p className="muted small" style={{ margin: 0 }}>{t("inviteHelp")}</p>
    <form className="grid" onSubmit={add}>
      <label className="field span2"><span>{t("emailLbl")}</span><input className="inp" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
      <label className="field"><span>{t("nameOpt")}</span><input className="inp" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <label className="field"><span>{t("roleLbl")}</span><select className="inp" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{ROLES.map(x => <option key={x} value={x}>{t("r_" + x)}</option>)}</select></label>
      <div className="field" style={{ justifyContent: "flex-end" }}><button className="btn primary" type="submit">{t("invite")}</button></div></form>
    {err && <div className="banner bad">{err}</div>}
    {list.length > 0 && <ul className="log">{list.map(i => <li key={i.email}><b>{i.email}</b>{i.name ? ` · ${i.name}` : ""} · {t("r_" + i.role)} · <span className={i.usedAt ? "good" : "muted"}>{t(i.usedAt ? "joined" : "pending")}</span>
      {!i.usedAt && <> <button className="btn sm ghost" type="button" onClick={async () => { await api("DELETE", `/api/staff/invites/${encodeURIComponent(i.email)}`); load(); }}>{t("withdraw")}</button></>}</li>)}</ul>}
  </section>;
}

export default function Page() { return <Shell wide={false}><Team /></Shell>; }
