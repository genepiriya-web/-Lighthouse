"use client";
// Admin: everything people sent with the Feedback button during the trial, new first.
import { useEffect, useState } from "react";
import { Shell, api, useApp } from "../ui/app";

function FeedbackList() {
  const { t, me, lang } = useApp(); const [rows, setRows] = useState<any[] | null>(null);
  const load = () => api("GET", "/api/feedback").then(r => setRows(r.ok ? r.body.feedback : []));
  useEffect(() => { if (me?.role === "admin") load(); }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (me?.role !== "admin") return <div className="banner bad">{t("rRole")}</div>;
  const mark = async (id: number, status: string) => { await api("PATCH", `/api/feedback/${id}`, { status }); load(); };
  return (<>
    <div className="view-head"><h1>{t("feedbackT")}</h1><span className="muted small">{rows ? rows.length : ""}</span></div>
    {!rows ? <div className="empty"><p>{t("loading")}</p></div> : !rows.length ? <div className="empty"><p>{t("noFeedback")}</p></div> :
      <div className="list">{rows.map(f => <div key={f.id} className="jrow prow" style={f.status === "new" ? undefined : { opacity: .6 }}>
        <span className="small"><b>{f.userName}</b><br /><span className="muted">{t("r_" + f.role)} · {new Date(f.at).toLocaleString(lang === "th" ? "th-TH" : "en-GB")}</span></span>
        <span className="small mono muted">{f.page}</span>
        <span className="t"><span style={{ whiteSpace: "pre-wrap" }}>{f.text}</span>
          <span className="row" style={{ marginTop: 4 }}>{["new", "seen", "done"].map(s => <button key={s} type="button" className="chip" aria-pressed={f.status === s} onClick={() => mark(f.id, s)}>{t("fb_" + s)}</button>)}</span></span>
      </div>)}</div>}
  </>);
}
export default function Page() { return <Shell><FeedbackList /></Shell>; }
