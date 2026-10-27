"use client";
// Customer search dropdown (Gene, 27 Oct 2026): type part of a name or code, pick from the customers in the database.
// Used by the new-job form and the job details. Arrow keys move, Enter picks, Escape closes. Leaving the field without
// picking puts back the customer the job already has, so a half-typed name is never saved.
import { useEffect, useRef, useState } from "react";
import { api, useApp } from "./app";

export interface PickedCustomer { id: string; name: string; code: string | null; flaggedNew: boolean; }

export function CustomerPick({ value, disabled, onPick }: { value: string; disabled?: boolean; onPick: (c: PickedCustomer) => void }) {
  const { t } = useApp();
  const [q, setQ] = useState(value); const [open, setOpen] = useState(false); const [hits, setHits] = useState<PickedCustomer[] | null>(null); const [at, setAt] = useState(0);
  const typed = useRef(false);
  useEffect(() => { setQ(value); }, [value]);
  useEffect(() => { if (!open || !typed.current || q.trim().length < 1) { setHits(null); return; }
    const h = setTimeout(() => api("GET", `/api/customers?q=${encodeURIComponent(q.trim())}`).then(r => { if (r.ok) { setHits(r.body.customers); setAt(0); } }), 200);
    return () => clearTimeout(h); }, [q, open]);
  const pick = (c: PickedCustomer) => { typed.current = false; setQ(c.name); setOpen(false); setHits(null); onPick(c); };
  const close = () => { typed.current = false; setOpen(false); setHits(null); setQ(value); };
  return <div style={{ position: "relative" }}>
    <input className="inp" role="combobox" aria-expanded={open && !!hits} aria-autocomplete="list" autoComplete="off" disabled={disabled} value={q} placeholder={t("searchCustName")}
      onChange={e => { typed.current = true; setQ(e.target.value); setOpen(true); }} onFocus={e => e.target.select()}
      onBlur={() => setTimeout(close, 150)}
      onKeyDown={e => { if (!hits?.length) { if (e.key === "Escape") close(); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setAt(Math.min(hits.length - 1, at + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setAt(Math.max(0, at - 1)); }
        else if (e.key === "Enter") { e.preventDefault(); pick(hits[at]); }
        else if (e.key === "Escape") close(); }} />
    {open && hits && <div className="results" role="listbox" style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", marginTop: 2, background: "var(--surface)", boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
      {hits.length ? hits.map((h, i) => <button key={h.id} type="button" role="option" aria-selected={i === at} className="res btn ghost"
        style={{ justifyContent: "space-between", borderRadius: 0, minWidth: 0, ...(i === at && { background: "color-mix(in srgb, var(--ink) 7%, transparent)" }) }}
        onMouseDown={e => e.preventDefault()} onClick={() => pick(h)}>
        <span className="ellip" style={{ minWidth: 0 }}>{h.name}</span><span className="muted small">{h.code}{h.flaggedNew ? ` · ${t("flaggedNew")}` : ""}</span></button>)
        : <div className="res muted small">{t("noMatch")}</div>}
    </div>}
  </div>;
}
