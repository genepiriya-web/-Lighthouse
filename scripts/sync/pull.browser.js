// Read-only puller for the old system (docs/old-system-readonly.md). Runs INSIDE a person's own logged-in tab on
// https://admin.lighthouse.co.th (Claude runs it in the desktop app's browser with javascript_exec; or paste it into the
// browser console). Never anywhere else.
//   * It calls the old app's own HTTP client (webpack module "hw50", export "b"), so the app's code adds its own login to
//     each request: this script never reads, stores or sends a password or token.
//   * It can only call the READ endpoints in ALLOW. Anything else throws before a request is made.
//   * The open list is built like the old job list: by named status (an empty status returns quotes only). Every Order,
//     Approve, Shipped and Returned job, and quotes that ship from QUOTE_DAYS ago on (the old system keeps every quote).
//   * Every open job's items and crew are read each time: a line edit in the old system does not change the job's
//     updatedDate (27 Oct sync: 6902171 and 6902176 changed lines with the same date), so date-based skipping misses edits.
//   * Jobs open last time (RECHECK) that left the open list are re-read with getByOrderId for their final status.
//   * Only the fields scripts/sync/convert.js uses are kept. When done it downloads lighthouse-sync-<run>.json (about
//     1.4 MB for ~200 jobs); move it to data/sync/ (git-ignored). The browser pane blocks pages from posting to this Mac,
//     so a download is the hand-over; it needs the person's OK each time.
// Start:    paste this file, then  window.__lhdPull(RECHECK_IDS)   — RECHECK_IDS: legacyId of every open job in data/export
// Progress: window.__lhdProgress   ({ done, total, run, downloaded })      Error: window.__lhdError
// ~3–5 minutes for ~200 jobs. Keep the tab open until `downloaded` is set.
(function () {
  const ALLOW = new Set(["/order/search", "/order/getByOrderId", "/orderProduct/findByOrderIdAndProductTypeId", "/orderCrew/search"]);
  let req; window.webpackJsonp.push([[Math.random()], { __lhdReq(m, e, r) { req = r; } }, [["__lhdReq"]]]);
  const http = req("hw50").b;
  const form = o => { const f = new FormData(); for (const k of Object.keys(o)) f.append(k, o[k]); return f; };
  const read = async (ep, params) => { if (!ALLOW.has(ep)) throw new Error("not a read endpoint: " + ep); return (await http.post(ep, form(params))).data; };
  const SEARCH = { orderId: "", jobTitle: "", jobType: "", departmentId: "", customerName: "", dop: "", salePerson: "", type: "" };
  const OPEN = ["Order", "Approve", "Shipped", "Returned"], QUOTE_DAYS = 30;
  const ORDER_FIELDS = ["id", "orderId", "status", "customerId", "customerName", "jobTitle", "jobType", "departmentId", "billingAddress", "phoneNo", "faxNo", "customerContact",
    "customerContactPhoneNo", "dop", "productManage", "gaffer", "keyGrip", "remark", "salePersonName", "type", "dpw", "tax", "shipDate", "returnDate", "usageStart", "usageEnd",
    "footerId", "remarkId", "discountPercent", "insuranceFree", "listPrice", "discount", "subTotal", "vat", "total", "revision", "createdDate", "createdBy", "updatedDate"];
  const pickO = o => Object.fromEntries(ORDER_FIELDS.filter(k => k in o).map(k => [k, o[k]]));
  const pickI = (x, t) => ({ id: x.id, __type: t, productId: x.productId, description: x.description, listPrice: x.listPrice, qty: x.qty, day: x.day, discount: x.discount,
    freeOfChange: x.freeOfChange, standBy: x.standBy, usageDateStart: x.usageDateStart, usageDateEnd: x.usageDateEnd, remark: x.remark,
    productWrapper: { productCode: x.productWrapper && x.productWrapper.productCode, description: x.productWrapper && x.productWrapper.description,
      orderProductChildWrappers: ((x.productWrapper && x.productWrapper.orderProductChildWrappers) || []).map(c => ({ productId: c.productId, productCode: c.productCode,
        childDescription: c.childDescription, listPrice: c.listPrice, quantity: c.quantity, discount: c.discount, day: c.day })) } });
  const pickC = (c, t) => ({ id: c.id, __type: t, crewId: c.crewId, crewCode: c.crewCode, crewName: c.crewName, position: c.position, price: c.price, qty: c.qty, day: c.day,
    ot: c.ot, otHour: c.otHour, total: c.total, usageDateStart: c.usageDateStart, usageDateEnd: c.usageDateEnd, remark: c.remark });

  window.__lhdPull = function (recheck = []) {
    const now = new Date(Date.now() + 7 * 3600e3).toISOString(); // Bangkok time for the run name
    const run = now.slice(0, 4) + now.slice(5, 7) + now.slice(8, 10) + "T" + now.slice(11, 13) + now.slice(14, 16);
    window.__lhdError = null; window.__lhdProgress = { done: 0, run };
    (async () => {
      const since = new Date(Date.now() - QUOTE_DAYS * 864e5).toISOString().slice(0, 10), orders = [];
      for (const status of [...OPEN, "Quote"]) for (let page = 1; ; page++) {
        const d = await read("/order/search", { ...SEARCH, status, page, pageSize: 50 });
        orders.push(...(d.content || []).filter(o => status !== "Quote" || String(o.shipDate || "").slice(0, 10) >= since));
        if (d.last || !(d.content || []).length || page > 60) break;
      }
      window.__lhdProgress.total = orders.length;
      const items = {}, crew = {};
      for (const o of orders) {
        items[o.id] = [];
        for (const t of [1, 2, 3, 4, 6]) { const d = await read("/orderProduct/findByOrderIdAndProductTypeId", { orderId: o.id, productTypeId: t, page: 1, pageSize: 300 }); items[o.id].push(...(d.content || []).map(x => pickI(x, t))); }
        crew[o.id] = [];
        for (const t of [5, 7]) { const d = await read("/orderCrew/search", { orderId: o.id, crewTypeId: t, page: 1, pageSize: 300 }); crew[o.id].push(...(d.content || []).map(c => pickC(c, t))); }
        window.__lhdProgress.done++;
      }
      const open = new Set(orders.map(o => o.id)), detail = {};
      for (const id of recheck) if (!open.has(id)) detail[id] = pickO(await read("/order/getByOrderId", { orderId: id }));
      const data = { run, at: new Date().toISOString(), orders: orders.map(pickO), items, crew, detail };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `lighthouse-sync-${run}.json`; document.body.appendChild(a); a.click(); a.remove();
      window.__lhdProgress.downloaded = a.download;
    })().catch(e => { window.__lhdError = String(e); });
    return run;
  };
})();
