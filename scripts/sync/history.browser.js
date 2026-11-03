// Read-only HISTORY puller for the old system (Gene, 3 Nov 2026: bring over all 10,154 jobs). Same rules as pull.browser.js:
// runs INSIDE a person's own logged-in tab on https://admin.lighthouse.co.th, uses the old app's own HTTP client (webpack
// module "hw50", export "b") so no password or token is ever read, and can only call the READ endpoints in ALLOW.
//   * Every job of every status (Draft INV, Cancel, Quote, the Q-numbered quotes with no status, and the open ones).
//   * Resumable: each finished job is kept in this tab's IndexedDB ("lhd-history"), so a reload or a sign-in that ran out
//     only means running it again. One job at a time, so it loads the old system like one person clicking.
//   * Downloads nothing by itself. __lhdHistAutoSave() (only when the person has OK'd all of them: Gene did, 3 Nov 2026)
//     downloads each part as it completes; __lhdHistSave(part) downloads one part (PART jobs) when OK'd; the
//     file has the same shape as a pull.browser.js file, so scripts/sync/convert.js reads it as it is.
//   * __lhdHistClear() empties the IndexedDB copy once every part is saved and imported.
// Start:    paste this file, then  window.__lhdHist()       Pause: window.__lhdHistPause = true   (run __lhdHist() to go on)
// Progress: window.__lhdHistProgress  ({ listed, done, total, perJob, parts })     Error: window.__lhdHistError
(function () {
  const ALLOW = new Set(["/order/search", "/orderProduct/findByOrderIdAndProductTypeId", "/orderCrew/search"]);
  let req; const mod = "__lhdHreq" + Date.now(); window.webpackJsonp.push([[Math.random()], { [mod](m, e, r) { req = r; } }, [[mod]]]);
  const http = req("hw50").b;
  const form = o => { const f = new FormData(); for (const k of Object.keys(o)) f.append(k, o[k]); return f; };
  // A read that fails (3 Nov 2026: "timeout of 0ms exceeded" during working hours) is tried again after 5, 20 and 60 s.
  const read = async (ep, params) => { if (!ALLOW.has(ep)) throw new Error("not a read endpoint: " + ep);
    for (const wait of [5, 20, 60, null]) { try { return (await http.post(ep, form(params))).data; }
      catch (e) { if (wait == null) throw e; window.__lhdHistRetries = (window.__lhdHistRetries || 0) + 1; await new Promise(r => setTimeout(r, wait * 1000)); } } };
  const SEARCH = { orderId: "", jobTitle: "", jobType: "", departmentId: "", customerName: "", dop: "", salePerson: "", type: "" };
  // "" = the Q-numbered quotes the old system keeps with no status
  const STATUSES = ["Draft INV", "Cancel", "Quote", "", "Order", "Approve", "Shipped", "Returned"], PAGE = 50, PART = 2000;
  const ORDER_FIELDS = ["id", "orderId", "status", "customerId", "customerName", "jobTitle", "jobType", "departmentId", "billingAddress", "phoneNo", "faxNo", "customerContact",
    "customerContactPhoneNo", "dop", "productManage", "gaffer", "keyGrip", "remark", "salePersonName", "type", "dpw", "tax", "shipDate", "returnDate", "usageStart", "usageEnd",
    "footerId", "remarkId", "discountPercent", "insuranceFree", "listPrice", "discount", "subTotal", "vat", "total", "revision", "createdDate", "createdBy", "updatedDate"];
  const pickO = o => Object.fromEntries(ORDER_FIELDS.filter(k => k in o).map(k => [k, o[k]]));
  const pickI = (x, t) => ({ id: x.id, __type: t, productId: x.productId, description: x.description, listPrice: x.listPrice, qty: x.qty, day: x.day, discount: x.discount,
    freeOfChange: x.freeOfChange, standBy: x.standBy, usageDateStart: x.usageDateStart, usageDateEnd: x.usageDateEnd, remark: x.remark, storeAdd: x.storeAdd,
    productWrapper: { productCode: x.productWrapper && x.productWrapper.productCode, description: x.productWrapper && x.productWrapper.description,
      orderProductChildWrappers: ((x.productWrapper && x.productWrapper.orderProductChildWrappers) || []).map(c => ({ productId: c.productId, productCode: c.productCode,
        childDescription: c.childDescription, listPrice: c.listPrice, quantity: c.quantity, discount: c.discount, day: c.day })) } });
  const pickC = (c, t) => ({ id: c.id, __type: t, crewId: c.crewId, crewCode: c.crewCode, crewName: c.crewName, position: c.position, price: c.price, qty: c.qty, day: c.day,
    ot: c.ot, otHour: c.otHour, total: c.total, usageDateStart: c.usageDateStart, usageDateEnd: c.usageDateEnd, remark: c.remark });

  // IndexedDB: "meta" (the job list and run name) and "jobs" (one finished job: order, items, crew)
  const db = () => new Promise((ok, no) => { const r = indexedDB.open("lhd-history", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("meta"); r.result.createObjectStore("jobs"); }; r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = async (store, mode, fn) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction(store, mode), s = t.objectStore(store); const r = fn(s);
    t.oncomplete = () => { d.close(); ok(r && r.result); }; t.onerror = () => { d.close(); no(t.error); }; }); };
  const get = (store, k) => tx(store, "readonly", s => s.get(k));
  const put = (store, k, v) => tx(store, "readwrite", s => s.put(v, k));
  const keys = store => tx(store, "readonly", s => s.getAllKeys());

  let running = false;
  window.__lhdHist = function () {
    if (running) return "already running";
    running = true; window.__lhdHistPause = false; window.__lhdHistError = null;
    (async () => {
      let meta = await get("meta", "list");
      if (!meta) {
        const now = new Date(Date.now() + 7 * 3600e3).toISOString();
        const run = now.slice(0, 4) + now.slice(5, 7) + now.slice(8, 10) + "T" + now.slice(11, 13) + now.slice(14, 16);
        const seen = new Map();
        for (const status of STATUSES) for (let page = 1; ; page++) {
          const d = await read("/order/search", { ...SEARCH, status, page, pageSize: PAGE });
          for (const o of d.content || []) if (!seen.has(o.id)) seen.set(o.id, pickO(o));
          window.__lhdHistProgress = { listed: seen.size, status };
          if (d.last || !(d.content || []).length || page > 1000) break;
        }
        // oldest first, so parts follow the job numbers
        meta = { run, at: new Date().toISOString(), orders: [...seen.values()].sort((a, b) => String(a.createdDate).localeCompare(String(b.createdDate)) || a.id - b.id) };
        await put("meta", "list", meta);
      }
      const done = new Set(await keys("jobs")), total = meta.orders.length, t0 = Date.now(); let n = 0;
      const progress = () => { window.__lhdHistProgress = { run: meta.run, listed: total, done: done.size, total, perJob: n ? +((Date.now() - t0) / n / 1000).toFixed(2) : null,
        parts: Math.ceil(total / PART) }; };
      progress();
      for (const o of meta.orders) {
        if (window.__lhdHistPause) break;
        if (done.has(o.id)) continue;
        const items = [], crew = [];
        for (const t of [1, 2, 3, 4, 6]) { const d = await read("/orderProduct/findByOrderIdAndProductTypeId", { orderId: o.id, productTypeId: t, page: 1, pageSize: 300 }); items.push(...(d.content || []).map(x => pickI(x, t))); }
        for (const t of [5, 7]) { const d = await read("/orderCrew/search", { orderId: o.id, crewTypeId: t, page: 1, pageSize: 300 }); crew.push(...(d.content || []).map(c => pickC(c, t))); }
        await put("jobs", o.id, { items, crew }); done.add(o.id); n++; progress();
      }
    })().catch(e => { window.__lhdHistError = String(e); }).finally(() => { running = false; });
    return "started";
  };

  /** Downloads part `p` (1-based, PART jobs each, oldest first) as lighthouse-history-<run>-<p>of<parts>.json. */
  window.__lhdHistSave = async function (p) {
    const meta = await get("meta", "list"); if (!meta) throw new Error("no history list yet");
    const parts = Math.ceil(meta.orders.length / PART), slice = meta.orders.slice((p - 1) * PART, p * PART);
    if (!slice.length) throw new Error(`there are ${parts} parts`);
    const items = {}, crew = {}, missing = [];
    for (const o of slice) { const j = await get("jobs", o.id); if (!j) { missing.push(o.orderId); continue; } items[o.id] = j.items; crew[o.id] = j.crew; }
    if (missing.length) throw new Error(`${missing.length} jobs of part ${p} not pulled yet, e.g. ${missing.slice(0, 3).join(", ")}`);
    const data = { run: `${meta.run}-history-${p}of${parts}`, at: meta.at, orders: slice, items, crew, detail: {} };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `lighthouse-history-${meta.run}-${p}of${parts}.json`; document.body.appendChild(a); a.click(); a.remove();
    return a.download;
  };

  /** Only after the person has OK'd every part's download: saves each part once, as soon as the pull has passed it. */
  window.__lhdHistAutoSave = function () {
    window.__lhdHistSaved = window.__lhdHistSaved || [];
    clearInterval(window.__lhdHistAutoTimer);
    window.__lhdHistAutoTimer = setInterval(async () => {
      const p = window.__lhdHistProgress; if (!p || !p.total || !p.parts) return;
      for (let k = 1; k <= p.parts; k++) {
        if (window.__lhdHistSaved.includes(k) || p.done < Math.min(k * PART, p.total)) continue;
        try { await window.__lhdHistSave(k); window.__lhdHistSaved.push(k); } catch (e) { window.__lhdHistError = String(e); }
      }
    }, 60000);
    return "auto-save on";
  };

  window.__lhdHistClear = () => new Promise((ok, no) => { const r = indexedDB.deleteDatabase("lhd-history"); r.onsuccess = () => ok("cleared"); r.onerror = () => no(r.error); });
})();
