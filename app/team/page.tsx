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
    <section className="sec"><h3>{t("roleGuide")}</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{ROLES.map(r => <li key={r}><b>{t("r_" + r)}</b> · {t("g_" + r)}</li>)}</ul></section>
  </>);
}
export default function Page() { return <Shell wide={false}><Team /></Shell>; }
