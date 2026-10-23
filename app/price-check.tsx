"use client";
import { useMemo, useState } from "react";
import { orderTotals, lineCalc, type Line, type Totals } from "../lib/logic";

const T = {
  en: { title: "Price check", lead: "Totals are computed here in your browser and again on the server, using the same rules file.", list: "List", qty: "Qty", days: "Days", disc: "Disc%", sub: "Sub total", vat: "VAT 7%", total: "Total", check: "Check on server", same: "Server agrees", differ: "Server differs", lang: "ไทย" },
  th: { title: "ตรวจราคา", lead: "ยอดคำนวณในเบราว์เซอร์และคำนวณซ้ำที่เซิร์ฟเวอร์ ด้วยไฟล์กฎเดียวกัน", list: "ราคา", qty: "จำนวน", days: "วัน", disc: "ส่วนลด%", sub: "ยอดหลังส่วนลด", vat: "VAT 7%", total: "รวม", check: "ตรวจที่เซิร์ฟเวอร์", same: "เซิร์ฟเวอร์ตรงกัน", differ: "เซิร์ฟเวอร์ไม่ตรง", lang: "EN" },
} as const;

// The locked test case from tests/logic.test.js: 24,000 × 3 × 2 days at 60% → 61,632 incl. VAT.
const START: Line[] = [{ t: 1, list: 24000, qty: 3, days: 2, disc: 60 }];
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PriceCheck() {
  const [lang, setLang] = useState<"th" | "en">("th");
  const [lines, setLines] = useState<Line[]>(START);
  const [server, setServer] = useState<Totals | null>(null);
  const t = T[lang];
  const local = useMemo(() => orderTotals(lines, { tax: "Vat" }), [lines]);

  const set = (i: number, k: keyof Line, v: string) => { setServer(null); setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: +v } : l))); };
  async function check() {
    const r = await fetch("/api/totals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines, order: { tax: "Vat" } }) });
    setServer(r.ok ? (await r.json()).totals : null);
  }
  const same = server && server.total === local.total && server.sub === local.sub;

  return (
    <>
      <div className="head"><h1>{t.title}</h1><button className="btn" type="button" onClick={() => setLang(lang === "th" ? "en" : "th")}>{t.lang}</button></div>
      <p className="muted">{t.lead}</p>
      <section className="sec">
        {lines.map((l, i) => (
          <div className="line" key={i}>
            {(["list", "qty", "days", "disc"] as const).map(k => (
              <label key={k}>{t[k]}<input className="inp num" inputMode="decimal" type="number" value={String(l[k] ?? "")} onChange={e => set(i, k, e.target.value)} /></label>
            ))}
            <span className="small muted num" style={{ gridColumn: "1/-1", textAlign: "right" }}>= ฿ {money(lineCalc(l).total)}</span>
          </div>
        ))}
        <div className="totals num">
          <span>{t.sub}</span><span>฿ {money(local.sub)}</span>
          <span>{t.vat}</span><span>฿ {money(local.vat)}</span>
          <span className="big">{t.total}</span><span className="big">฿ {money(local.total)}</span>
        </div>
        <div className="head">
          <button className="btn primary" type="button" onClick={check}>{t.check}</button>
          {server && <span className={same ? "ok" : "bad"} data-testid="server-result">{same ? t.same : t.differ}: ฿ {money(server.total)}</span>}
        </div>
      </section>
    </>
  );
}
