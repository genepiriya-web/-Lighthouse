"use client";
// Admin: every report sent with the Feedback button, new first — type, page, device details, recent errors, and whether
// Discord got it (opening this page retries any it didn't).
import { useEffect, useState } from "react";
import { Shell, api, useApp } from "../ui/app";

function FeedbackList() {
  const { t, me, lang } = useApp(); const [rows, setRows] = useState<any[] | null>(null); const [discord, setDiscord] = useState(false); const [kind, setKind] = useState("");
  const load = () => api("GET", "/api/feedback").then(r => { setRows(r.ok ? r.body.feedback : []); setDiscord(!!r.body?.discord); });
  useEffect(() => { if (me?.role === "admin") load(); }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (me?.role !== "admin") return <div className="banner bad">{t("rRole")}</div>;
  const mark = async (id: number, status: string) => { await api("PATCH", `/api/feedback/${id}`, { status }); load(); };
  const shown = (rows ?? []).filter(f => !kind || f.kind === kind);
  return (<>
    <div className="view-head"><h1>{t("feedbackT")}</h1><span className="muted small">{rows ? shown.length : ""}</span></div>
    <div className="row" style={{ marginBottom: 8 }}>{["", "bug", "confusing", "idea", "other"].map(k =>
      <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{t(k ? "fb_" + k : "fbAll")}</button>)}</div>
    {!rows ? <div className="empty"><p>{t("loading")}</p></div> : !shown.length ? <div className="empty"><p>{t("noFeedback")}</p></div> :
      <div className="list">{shown.map(f => <div key={f.id} id={`f${f.id}`} className="jrow prow" style={f.status === "new" ? undefined : { opacity: .6 }}>
        <span className="small"><b>#{f.id} · {t("fb_" + f.kind)}</b><br />{f.userName}<br /><span className="muted">{t("r_" + f.role)} · {new Date(f.at).toLocaleString(lang === "th" ? "th-TH" : "en-GB")}</span>
          {discord && <><br /><span className={f.notifiedAt ? "muted" : "bad"}>{t(f.notifiedAt ? "fbSent" : "fbNotSent")}{f.notifyError ? ` (${f.notifyError})` : ""}</span></>}</span>
        <span className="small mono muted" style={{ overflowWrap: "anywhere" }}>{f.page}{f.meta && <><br />{f.meta.vw}×{f.meta.vh} · {f.meta.lang}<br />{f.meta.ua}</>}</span>
        <span className="t"><span style={{ whiteSpace: "pre-wrap" }}>{f.text}</span>
          {f.meta?.errors?.length > 0 && <span className="small mono bad" style={{ display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 4 }}>{f.meta.errors.join("\n")}</span>}
          <span className="row" style={{ marginTop: 4 }}>{["new", "seen", "done"].map(s => <button key={s} type="button" className="chip" aria-pressed={f.status === s} onClick={() => mark(f.id, s)}>{t("fb_" + s)}</button>)}</span></span>
      </div>)}</div>}
  </>);
}
export default function Page() { return <Shell><FeedbackList /></Shell>; }
