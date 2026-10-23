"use client";
// Job sheet: details, items, totals, status moves, CEO price confirmation, check-out/in and history.
// Mirrors the artifact's order sheet. The buttons shown follow the same rules the server enforces (logic.js + lib/rules.ts);
// the server stays the authority and its refusals are shown as they come back.
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, api, useApp, stCls, money, fmtD } from "../../ui/app";
import { TYPES, STATUSES, STOCKED_TYPES, MOVES, moveCheck, canEditLines, orderTotals, typeTotals, lineCalc, chargeDays, defaultDisc, expandKit, syncChildren, type Line } from "../../../lib/logic";
import { canEditHeader, canEditMoney, canStore, type PriceBreak } from "../../../lib/rules";

type Any = Record<string, any>;
interface Data { order: Any; lines: Array<Line & { k: string }>; activity: Any[]; needsCeo: PriceBreak[]; customer: { id: string; name: string; default_disc: number } | null; }
const typeLabel = (id: number) => { const k = TYPES.find(x => x.id === id)?.k ?? ""; return k ? k[0] + k.slice(1).toLowerCase() : ""; };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// [label key, field, kind]
const HEADER: Array<[string, string, "text" | "date" | "select" | "area", string[]?]> = [
  ["h_title", "jobTitle", "text"], ["h_cust", "customerName", "text"], ["h_dop", "dop", "text"], ["h_jt", "jobType", "select", ["", "CO-PRO", "FILM", "SP", "TVC", "TVD"]],
  ["h_dept", "dept", "select", ["", "1", "2", "3"]], ["h_ship", "ship", "date"], ["h_ret", "ret", "date"], ["h_us", "useStart", "date"], ["h_ue", "useEnd", "date"],
  ["h_type", "rentType", "select", ["Daily", "Weekly"]], ["h_dpw", "dpw", "text"], ["h_tax", "tax", "select", ["Vat", "Not Vat"]], ["h_sale", "sale", "text"],
  ["h_bill", "billing", "text"], ["h_phone", "phone", "text"], ["h_contact", "contact", "text"], ["h_cphone", "contactPhone", "text"],
  ["h_pm", "pm", "text"], ["h_gf", "gaffer", "text"], ["h_kg", "keyGrip", "text"], ["h_note", "note", "area"],
];
const SNAKE: Record<string, string> = { jobTitle: "job_title", customerName: "customer_name", jobType: "job_type", useStart: "use_start", useEnd: "use_end", rentType: "rent_type",
  contactPhone: "contact_phone", keyGrip: "key_grip", extraDisc: "extra_disc" };
const col = (k: string) => SNAKE[k] ?? k;
const DEPTS: Record<string, string> = { "": "", 1: "LIGHTING", 2: "GRIP", 3: "GRIP&LIGHTING" };

function Sheet({ id }: { id: string }) {
  const { t, me } = useApp(); const role = me?.role ?? "none"; const router = useRouter();
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState<string>(""); const [stale, setStale] = useState(false);
  const [draft, setDraft] = useState<Array<Line & { k: string }> | null>(null); const [tt, setTt] = useState(1); const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => { const r = await api<Data & { error?: string }>("GET", `/api/orders/${encodeURIComponent(id)}`);
    if (r.ok) { setD(r.body); setDraft(null); setStale(false); setErr(""); } else setErr(t(r.body?.error ?? "error")); }, [id, t]);
  useEffect(() => { load(); }, [load]);

  const o = d?.order; const lines = draft ?? d?.lines ?? [];
  const legacy = o?.owner === "legacy";
  const dirty = draft !== null;
  const run = async (method: string, path: string, body: Any) => {
    setBusy(true); setErr("");
    const r = await api(method, `/api/orders/${encodeURIComponent(id)}${path}`, { rev: o!.rev, ...body }); setBusy(false);
    if (r.status === 409 && r.body?.error === "stale") { setStale(true); return null; }
    if (!r.ok) { const b = r.body ?? {}; setErr(t(b.error ?? "error") + (b.issues ? " " + b.issues.map((x: Any) => `#${x.pid} −${x.short}`).join(", ") : "") + (b.message && !b.issues && !b.breaks && t(b.error) === b.error ? ` ${b.message}` : "")); return null; }
    await load(); return r.body;
  };

  const money$ = useMemo(() => o ? { extraDisc: o.extra_disc, insurance: o.insurance, adjust: o.adjust, tax: o.tax } : {}, [o]);
  if (!d || !o) return err ? <div className="banner bad">{err}</div> : <div className="empty"><p>{t("loading")}</p></div>;

  const editH = !legacy && canEditHeader(role, o.status);
  const editM = !legacy && canEditMoney(role, o.status);
  const editL = !legacy && canEditLines(role, o.status);
  const G = orderTotals(lines, money$); const T = typeTotals(lines, tt);
  const logicOrder = { status: o.status, customerName: o.customer_name ?? "", ship: o.ship ?? "", ret: o.ret ?? "" };
  const moves = (MOVES[o.status] ?? []).map(s => { let why: string | null = moveCheck(role, logicOrder, s, lines, []); if (!why && s === "Shipped" && d.needsCeo.length) why = "rPriceApproval"; return { s, why }; }).filter(m => m.why !== "rRole");
  const canCancel = !legacy && moveCheck(role, logicOrder, "Cancel", lines, []) === null;
  const idx = STATUSES.indexOf(o.status);
  const breakOf = (k: string) => d.needsCeo.filter(b => b.k === k);

  const saveHeader = (k: string, v: string) => { const cur = String(o[col(k)] ?? ""); if (v === cur) return; const val = k === "dept" || k === "dpw" ? (v === "" ? null : +v) : v; run("PATCH", "", { [k]: val }); };
  const setLine = (k: string, patch: Partial<Line>) => setDraft(syncChildren(lines.map(l => l.k === k ? { ...l, ...patch } : l)) as Data["lines"]);
  const removeLine = (k: string) => setDraft(lines.filter(l => l.k !== k && l.parent !== k));

  return (
    <>
      <div className="sheet-head">
        <div style={{ minWidth: 0 }}>
          <div className="row"><Link href="/jobs" className="btn sm ghost">← {t("back")}</Link><span className="mono muted">{t("orderT")} # {o.no}</span><span className={stCls(o.status)}>{o.status}</span>{legacy && <span className="tag">{t("legacy")}</span>}<span className="muted small">{t("rev")} {String(o.rev).padStart(3, "0")}</span></div>
          <h2 style={{ fontFamily: "var(--f-display)", fontSize: 28 }}>{o.job_title || "—"}</h2><div className="muted">{o.customer_name}</div>
        </div>
      </div>
      {o.status !== "Cancel" && <ol className={`stepper st-${String(o.status).split(" ")[0]}`}>{STATUSES.map((s, i) => <li key={s} className={i < idx ? "done" : i === idx ? "now" : ""}>{s}</li>)}</ol>}
      {legacy && <div className="banner">{t("legacyRo")}</div>}
      {stale && <div className="banner bad row" style={{ justifyContent: "space-between" }}><span>{t("stale")}</span><button className="btn sm" type="button" onClick={load}>{t("reload")}</button></div>}
      {err && <div className="banner bad">{err}</div>}

      {(role === "admin" || role === "sale") && <div className="row"><button className="btn ghost" type="button" disabled={busy || dirty} onClick={async () => {
        setBusy(true); const r = await api("POST", `/api/orders/${encodeURIComponent(id)}/copy`, {}); setBusy(false);
        if (r.ok) router.push(`/jobs/${encodeURIComponent(r.body.id)}`); else setErr(t(r.body?.error ?? "error")); }}>{t("copyJob")}</button></div>}
      {!legacy && (moves.length > 0 || canCancel) && <div className="row">
        {moves.map((m, i) => <button key={m.s} className={`btn ${i === 0 ? "primary" : ""}`} type="button" disabled={!!m.why || dirty || busy} onClick={() => run("POST", "/move", { to: m.s })}>{t("moveTo", { s: m.s })}</button>)}
        {canCancel && <button className="btn danger" type="button" disabled={busy} onClick={() => { if (!confirmCancel) { setConfirmCancel(true); return; } setConfirmCancel(false); run("POST", "/move", { to: "Cancel" }); }}>{confirmCancel ? t("cancelSure") : t("cancelJob")}</button>}
      </div>}
      {!legacy && moves.some(m => m.why) && <div className="muted small">{[...new Set(moves.filter(m => m.why).map(m => t(m.why!)))].join(" · ")}{dirty ? ` · ${t("unsaved")}` : ""}</div>}

      {d.needsCeo.length > 0 && <section className="sec" style={{ borderLeft: "4px solid var(--warn)" }}>
        <h3>{t("needsCeo")}</h3>
        <ul className="log">{d.needsCeo.map((b, i) => <li key={i}><b className="mono">{b.code || b.k}</b> {b.rule === "below_catalog" ? `฿${money(b.value)} — ${t("br_below_catalog", { l: "฿" + money(b.limit) })}` : b.rule === "no_discount" ? `${b.value}% — ${t("br_no_discount")}` : `${b.value}% — ${t("br_over_max_disc", { l: b.limit })}`}</li>)}</ul>
        {role === "admin" && ["Quote", "Order", "Approve"].includes(o.status) && <div><button className="btn primary" type="button" disabled={busy || dirty} onClick={() => run("POST", "/approve-prices", {})}>{t("ceoApprove")}</button></div>}
      </section>}
      {d.needsCeo.length === 0 && o.price_approval && <div className="muted small">{t("ceoApproved", { n: o.price_approval.by_name })} · {fmtD(o.price_approval.at)}</div>}

      <details className="sec" open={d.lines.length === 0} key={d.lines.length === 0 ? "open" : "closed"}>
        <summary><h3>{t("orderT")}<small>{t("created")} {fmtD(o.created_at)} · {o.created_by_name}</small></h3></summary>
        <div className="grid">{HEADER.map(([label, k, kind, opts]) => {
          const v = String(o[col(k)] ?? ""); const dis = !editH; const span = ["jobTitle", "customerName", "billing"].includes(k) ? "field span2" : kind === "area" ? "field spanall" : "field";
          return <label key={k} className={span}><span>{t(label)}</span>
            {kind === "select" ? <select className="inp" disabled={dis} defaultValue={v} key={v + o.rev} onChange={e => saveHeader(k, e.target.value)}>{opts!.map(x => <option key={x} value={x}>{k === "dept" ? DEPTS[x] || t("pick") : x || t("pick")}</option>)}</select>
              : kind === "area" ? <textarea className="inp" disabled={dis} defaultValue={v} key={v + o.rev} onBlur={e => saveHeader(k, e.target.value)} />
              : <input className="inp" type={kind === "date" ? "date" : "text"} disabled={dis} defaultValue={v} key={v + o.rev} onBlur={e => saveHeader(k, e.target.value)} onChange={kind === "date" ? e => saveHeader(k, e.target.value) : undefined} />}
          </label>; })}</div>
      </details>

      <section className="sec">
        <h3>{t("items")}<small>{t("t_grand")}: ฿ {money(G.total)}</small></h3>
        {!editL && <div className="muted small">{t("readOnlyItems")}</div>}
        <div className="ttabs" role="tablist">{TYPES.map(x => { const n = lines.filter(l => l.t === x.id && !l.parent).length;
          return <button key={x.id} className="ttab" type="button" role="tab" aria-selected={tt === x.id} onClick={() => setTt(x.id)}>{typeLabel(x.id)}{n ? <span className="n">{n}</span> : null}</button>; })}</div>
        <div>
          <div className="lrow head"><span>{t("i_desc")}</span><span>{t("i_list")}</span><span>{t("i_qty")}</span><span>{t("i_days")}</span><span>{tt === 5 || tt === 7 ? t("i_ot") : t("i_disc")}</span><span style={{ textAlign: "right" }}>{t("i_total")}</span><span /></div>
          {lines.filter(l => l.t === tt).map(l => { const child = !!l.parent; const c = lineCalc(l); const crew = l.t === 5 || l.t === 7; const can = editL && !child; const br = breakOf(l.k);
            const num = (f: keyof Line, step = "1") => <label><span className="lbl">{t(f === "list" ? "i_list" : f === "qty" ? "i_qty" : f === "days" ? "i_days" : f === "ot" ? "i_ot" : "i_disc")}</span>
              <input className="inp cell num" type="number" min={0} step={step} disabled={!can} value={String(l[f] ?? 0)} onChange={e => setLine(l.k, { [f]: Math.max(0, parseFloat(e.target.value) || 0) } as Partial<Line>)} /></label>;
            return <div key={l.k} className={`lrow ${child ? "child" : ""}`} style={br.length ? { background: "color-mix(in srgb,var(--warn) 10%,transparent)" } : undefined}>
              <span className="desc"><b>{l.code}</b>{l.desc}{crew && l.otRate ? <span className="muted small"> · {t("otPerHr", { r: "฿" + money(+l.otRate) })}</span> : null}{l.foc ? <span className="tag"> FOC</span> : null}{l.sb ? <span className="tag"> SB</span> : null}{child ? <span className="muted small"> · {t("kitOf")}</span> : null}</span>
              {num("list", "0.01")}{num("qty")}{num("days", "0.5")}{crew ? num("ot", "0.5") : num("disc", "0.01")}
              <span className="tot num" style={{ textAlign: "right" }}>฿ {money(c.total)}</span>
              <span>{can && <button className="btn sm ghost" type="button" onClick={() => removeLine(l.k)} aria-label={t("remove")}>✕</button>}</span>
            </div>; })}
        </div>
        {editL && <AddItem tt={tt} order={o} customer={d.customer} onAdd={add => setDraft([...lines, ...add])} />}
        {dirty && <div className="row"><button className="btn primary" type="button" disabled={busy} onClick={async () => { const r = await run("PUT", "/lines", { lines: draft }); if (r) setDraft(null); }}>{t("saveItems")}</button>
          <button className="btn" type="button" onClick={() => setDraft(null)}>{t("cancel")}</button><span className="warn small">{t("unsaved")}</span></div>}
        <div className="cols2">
          <div className="totals"><b style={{ gridColumn: "1/-1" }}>{t("t_type", { t: typeLabel(tt) })}</b><span>{t("t_list")}</span><span className="num">฿ {money(T.list)}</span><span>{t("t_disc")}</span><span className="num">฿ {money(T.disc)}</span><span>{t("t_sub")}</span><span className="num">฿ {money(T.sub)}</span></div>
          <div className="totals"><b style={{ gridColumn: "1/-1" }}>{t("t_grand")}</b>
            <span>{t("t_list")}</span><span className="num">฿ {money(G.list)}</span><span>{t("t_disc")}</span><span className="num">฿ {money(G.disc)}</span><span>{t("t_sub")}</span><span className="num">฿ {money(G.sub)}</span>
            <span>{t("extraDisc")}</span><span>{editM && !dirty ? <input className="inp cell num" type="number" min={0} max={100} step="0.01" defaultValue={o.extra_disc} key={"x" + o.rev} onBlur={e => +e.target.value !== o.extra_disc && run("PATCH", "", { extraDisc: +e.target.value || 0 })} /> : <span className="num">{o.extra_disc}%</span>}</span>
            {G.extra ? <><span>{t("t_extra")}</span><span className="num">- ฿ {money(G.extra)}</span></> : null}
            <span>{t("adjustTo")}</span><span>{editM && !dirty ? <input className="inp cell num" style={{ width: 110 }} type="number" step="0.01" placeholder={money(G.sub - G.extra)} defaultValue={G.adj ? (G.sub - G.extra + G.adj).toFixed(2) : ""} key={"a" + o.rev}
              onBlur={e => { const G0 = orderTotals(lines, { ...money$, adjust: 0 }); const v = e.target.value === "" ? 0 : Math.round(((parseFloat(e.target.value) || 0) - (G0.sub - G0.extra)) * 100) / 100; if (v !== o.adjust) run("PATCH", "", { adjust: v }); }} />
              : <span className="num">{G.adj ? "฿ " + money(G.sub - G.extra + G.adj) : "–"}</span>}</span>
            <span>{t("insurance")}</span><span>{editM && !dirty ? <input className="inp cell num" type="number" min={0} step="0.01" defaultValue={o.insurance} key={"i" + o.rev} onBlur={e => +e.target.value !== o.insurance && run("PATCH", "", { insurance: +e.target.value || 0 })} /> : <span className="num">฿ {money(G.ins)}</span>}</span>
            <span>{t("t_vat")}{o.tax === "Not Vat" ? " (Not Vat)" : ""}</span><span className="num">฿ {money(G.vat)}</span>
            <span className="rule" /><span><b>{t("t_total")}</b></span><span className="big num">฿ {money(G.total)}</span></div>
        </div>
      </section>

      {["Approve", "Shipped", "Returned"].includes(o.status) && <Store o={o} lines={d.lines} can={!legacy && canStore(role) && o.status !== "Returned"} canRepair={!legacy && canStore(role)} run={run} busy={busy} />}

      <Docs id={id} />
      {role === "admin" && d.lines.some(l => (l.t === 5 || l.t === 7) && l.crewId) && <CrewLinks id={id} onChange={load} />}

      {d.activity.length > 0 && <section className="sec"><h3>{t("activity")}</h3>
        <ul className="log">{[...d.activity].reverse().map((a, i) => { const w = new Date(a.at);
          const text = a.action === "created" ? t("a_created") : a.action === "status" ? t("a_status", { s: a.detail?.to }) : a.action === "status_fix" ? t("a_status_fix", { s: a.detail?.to }) + (a.detail?.reason ? ` — ${a.detail.reason}` : "") : t("a_" + a.action);
          return <li key={i}><time>{fmtD(w.toISOString())} {String(w.getHours()).padStart(2, "0")}:{String(w.getMinutes()).padStart(2, "0")}</time><b>{a.actor_name || t("someone")}</b> {text}</li>; })}</ul></section>}
    </>
  );
}

function AddItem({ tt, order, customer, onAdd }: { tt: number; order: Any; customer: Data["customer"]; onAdd: (l: Array<Line & { k: string }>) => void }) {
  const { t } = useApp(); const [q, setQ] = useState(""); const [hits, setHits] = useState<Any[]>([]); const [deptOnly, setDeptOnly] = useState(true);
  useEffect(() => { if (q.trim().length < 2) { setHits([]); return; }
    const dept = deptOnly && order.dept ? `&dept=${order.dept}` : "";
    const h = setTimeout(() => (tt === 5 || tt === 7 ? api("GET", `/api/crew?q=${encodeURIComponent(q.trim())}${dept}`).then(r => r.ok && setHits(r.body.crew))
      : api("GET", `/api/products?type=${tt}&q=${encodeURIComponent(q.trim())}${dept}`).then(r => r.ok && setHits(r.body.products))), 200);
    return () => clearTimeout(h); }, [q, tt, deptOnly, order.dept]);
  const crew = tt === 5 || tt === 7;
  const addCrew = (r: Any) => { const start = order.use_start || order.ship, end = order.use_end || order.ret;
    onAdd([{ k: uid(), t: tt, pid: null, crewId: String(r.crewId), code: r.posCode ?? "", desc: (r.posName ?? "") + (r.name || r.nick ? " · " + (r.name || r.nick) : ""), list: +r.price || 0,
      otRate: +r.priceOt || 0, ot: 0, qty: 1, days: chargeDays(start, end, order.rent_type, order.dpw) || 1, disc: 0, foc: false, sb: false, start, end, parent: null, remark: "" }]); setQ(""); setHits([]); };
  const add = (p: Any) => {
    const start = order.use_start || order.ship, end = order.use_end || order.ret;
    const parent: Line & { k: string } = { k: uid(), t: p.type, pid: p.id, code: p.code, desc: p.desc, list: +p.price || 0, qty: 1, days: chargeDays(start, end, order.rent_type, order.dpw) || 1,
      disc: defaultDisc({ discountable: p.discountable, maxDisc: p.maxDisc }, customer?.default_disc ?? 0), foc: false, sb: false, start, end, parent: null, remark: "" };
    const cat = new Map<number, { code: string; desc: string }>((p.kitProducts ?? []).map((x: Any) => [x.id, { code: x.code, desc: x.desc }]));
    onAdd([parent, ...expandKit(parent, p.kit ?? [], cat, uid) as Array<Line & { k: string }>]); setQ(""); setHits([]);
  };
  return <div className="field"><span>{t("addItem")}</span>
    <div className="row"><input className="inp" style={{ flex: 1, minWidth: 0 }} type="search" placeholder={t(crew ? "searchCrew" : "searchItems")} value={q} onChange={e => setQ(e.target.value)} />
      {order.dept ? <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={deptOnly} onChange={e => setDeptOnly(e.target.checked)} />{t("onlyDept")}</label> : null}</div>
    {crew && hits.length > 0 && <div className="results">{hits.map(r => <div key={`${r.crewId}-${r.positionId}-${r.rateNo}`} className="res"><span style={{ minWidth: 0 }}>{r.posName} <span className="muted">· {r.name || r.nick}</span>
      <span className="muted small"> · <span className="mono">{r.posCode}</span> · ฿{money(r.price)} · {t("otPerHr", { r: "฿" + money(r.priceOt) })}</span>{r.needsReview ? <span className="tag"> {t("rateCheck")}</span> : null}</span>
      <button className="btn sm" type="button" onClick={() => addCrew(r)}>+</button></div>)}</div>}
    {!crew && hits.length > 0 && <div className="results">{hits.map(p => <div key={p.id} className="res"><span style={{ minWidth: 0 }}><b className="mono">{p.code}</b> {p.desc}<span className="muted small"> · ฿{money(p.price)}{t("perDay")} · {t("stock")} {p.stock}{p.kit?.length ? ` · ${t("kit")} ${p.kit.length}` : ""}</span></span>
      <button className="btn sm" type="button" onClick={() => add(p)}>+</button></div>)}</div>}
  </div>;
}

/** Quotation / Draft INV / Item list, with or without discount — rendered by the server (lib/docs.js), as on the artifact.
 *  The preview is a sandboxed frame: no scripts, whatever the old system's templates contain. */
function Docs({ id }: { id: string }) {
  const { t } = useApp(); const [kind, setKind] = useState<"quote" | "draft" | "items">("quote"); const [disc, setDisc] = useState(true); const [open, setOpen] = useState(false);
  const url = `/api/orders/${encodeURIComponent(id)}/document?kind=${kind}&disc=${disc ? 1 : 0}`;
  return <section className="sec"><h3>{t("docs")}</h3>
    <div className="row"><div className="seg">{([["quote", "docQuote"], ["draft", "docDraft"], ["items", "docItems"]] as const).map(([k, l]) =>
      <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{t(l)}</button>)}</div>
      {kind !== "items" && <div className="seg"><button type="button" aria-pressed={disc} onClick={() => setDisc(true)}>{t("withDisc")}</button><button type="button" aria-pressed={!disc} onClick={() => setDisc(false)}>{t("noDisc")}</button></div>}
      <a className="btn primary" href={url} download>{t("download")} .html</a></div>
    <details onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}><summary className="small muted" style={{ cursor: "pointer" }}>{t("preview")}</summary>
      {open && <iframe title={t("preview")} src={`${url}&inline=1`} sandbox="" style={{ width: "100%", height: 520, border: "1px solid var(--line)", borderRadius: 6, background: "#fff" }} />}</details>
  </section>;
}

/** Admin: send the job's crew list (with national IDs) to a client as an expiring link. The link is shown once. */
function CrewLinks({ id, onChange }: { id: string; onChange: () => void }) {
  const { t } = useApp(); const [crew, setCrew] = useState<Any[] | null>(null); const [links, setLinks] = useState<Any[]>([]);
  const [f, setF] = useState({ recipient: "", hours: 72, show: "full" }); const [made, setMade] = useState<string | null>(null); const [copied, setCopied] = useState(false); const [err, setErr] = useState("");
  const enc = encodeURIComponent(id);
  const load = () => { api("GET", `/api/orders/${enc}/crew`).then(r => r.ok && setCrew(r.body.crew)); api("GET", `/api/orders/${enc}/crew-links`).then(r => r.ok && setLinks(r.body.links)); };
  useEffect(load, [enc]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async (e: React.FormEvent) => { e.preventDefault(); setErr(""); setCopied(false);
    const r = await api("POST", `/api/orders/${enc}/crew-links`, f); if (!r.ok) { setErr(t(r.body?.error ?? "error")); return; }
    setMade(`${location.origin}${r.body.path}`); setF({ ...f, recipient: "" }); load(); onChange(); };
  const revoke = async (lid: string) => { await api("POST", `/api/crew-links/${encodeURIComponent(lid)}/revoke`, {}); load(); onChange(); };
  return <section className="sec"><h3>{t("crewIdsBtn")}</h3>
    <p className="muted small" style={{ margin: 0 }}>{t("idsPrivacyV2")}</p>
    {crew && <ul className="log">{crew.map(c => <li key={c.crewId}><b>{c.name}</b> · {c.position} · <span className="muted">{c.dates}</span> · <span className="mono">{c.masked ?? t("noIdOnFile")}</span></li>)}</ul>}
    <form className="grid" onSubmit={create}>
      <label className="field span2"><span>{t("linkFor")}</span><input className="inp" required minLength={2} value={f.recipient} onChange={e => setF({ ...f, recipient: e.target.value })} /></label>
      <label className="field"><span>{t("linkHours")}</span><select className="inp" value={f.hours} onChange={e => setF({ ...f, hours: +e.target.value })}>{[24, 72, 168].map(h => <option key={h} value={h}>{t("hours", { n: h })}</option>)}</select></label>
      <label className="field"><span>{t("natId")}</span><select className="inp" value={f.show} onChange={e => setF({ ...f, show: e.target.value })}><option value="full">{t("linkShowFull")}</option><option value="masked">{t("linkShowMasked")}</option></select></label>
      <div className="field" style={{ justifyContent: "flex-end" }}><button className="btn primary" type="submit">{t("linkCreate")}</button></div>
    </form>
    {err && <div className="banner bad">{err}</div>}
    {made && <div className="banner"><div className="small">{t("linkOnce")}</div><div className="row" style={{ marginTop: 4 }}><input className="inp mono" readOnly value={made} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 0 }} />
      <button className="btn sm" type="button" onClick={async () => { try { await navigator.clipboard.writeText(made); setCopied(true); } catch { /* clipboard blocked: the field can still be selected */ } }}>{copied ? t("linkCopied") : t("linkCopy")}</button></div></div>}
    {links.length > 0 && <><b className="small">{t("linksSent")}</b><ul className="log">{links.map(l => <li key={l.id}><b>{l.recipient}</b> · {t(l.show === "full" ? "linkShowFull" : "linkShowMasked")} · {l.views}/{l.maxViews} {t("views")} ·{" "}
      <span className={l.state === "active" ? "good" : "muted"}>{t("lk_" + l.state)}</span> · <span className="muted">{fmtD(l.expiresAt)}</span>
      {l.state === "active" && <> <button className="btn sm ghost" type="button" onClick={() => revoke(l.id)}>{t("revoke")}</button></>}</li>)}</ul></>}
  </section>;
}

function Store({ o, lines, can, canRepair, run, busy }: { o: Any; lines: Data["lines"]; can: boolean; canRepair: boolean; run: (m: string, p: string, b: Any) => Promise<any>; busy: boolean }) {
  const { t } = useApp(); const mode = o.status === "Approve" ? "out" : "in"; const stocked = lines.filter(l => STOCKED_TYPES.includes(l.t)); if (!stocked.length) return null;
  const done = (l: Line) => mode === "out" ? (+l.out! || 0) >= (+l.qty! || 0) : ((+l.in! || 0) + (+l.lost! || 0)) >= (+l.out! || 0);
  const path = mode === "out" ? "/checkout" : "/checkin";
  const cell = (l: Line & { k: string }, f: "out" | "in" | "dmg" | "lost") => { const editable = can && ((mode === "out" && f === "out") || (mode === "in" && f !== "out"));
    return <label><span className="lbl">{t(f === "out" ? "outQ" : f === "in" ? "inQ" : f)}</span>{editable
      ? <input className="inp cell num" type="number" min={0} defaultValue={+(l[f] ?? 0)} key={`${l.k}${f}${o.rev}`} onBlur={e => { const v = Math.max(0, Math.round(+e.target.value || 0)); if (v !== +(l[f] ?? 0)) run("POST", path, { lines: [{ k: l.k, [f]: v }] }); }} />
      : <span className="num">{+(l[f] ?? 0)}</span>}</label>; };
  return <section className="sec"><h3>{t(mode === "out" ? "checkout" : "checkin")}<small>{stocked.filter(done).length} / {stocked.length}</small></h3>
    {can && <div className="row"><button className="btn" type="button" disabled={busy} onClick={() => run("POST", path, { all: true })}>{t(mode === "out" ? "allOut" : "allIn")}</button></div>}
    <div><div className="lrow head"><span>{t("i_desc")}</span><span>{t("i_qty")}</span><span>{t("outQ")}</span>{mode === "in" ? <><span>{t("inQ")}</span><span>{t("dmg")}</span><span>{t("lost")}</span></> : <><span /><span /><span /></>}<span /></div>
      {stocked.map(l => <div key={l.k} className={`lrow ${l.parent ? "child" : ""}`}><span className="desc"><b>{l.code}</b>{l.desc} {done(l) && <span className="good">✓</span>}</span>
        <label><span className="lbl">{t("i_qty")}</span><span className="num">{l.qty}</span></label>{cell(l, "out")}
        {mode === "in" ? <>{cell(l, "in")}{cell(l, "dmg")}{cell(l, "lost")}</> : <><span /><span /><span /></>}<span>{l.repaired ? <span className="tag">{t("repair")}</span> : null}</span></div>)}</div>
    {mode === "in" && canRepair && stocked.some(l => (+l.dmg! || 0) > 0 && !l.repaired) && <div><button className="btn" type="button" disabled={busy} onClick={() => run("POST", "/repairs", {})}>{t("sendRepair")}</button></div>}
  </section>;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Shell><Sheet id={decodeURIComponent(id)} /></Shell>;
}
