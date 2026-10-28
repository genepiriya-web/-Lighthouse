// Prints the old-system ids of every job that is open in data/export, for window.__lhdPull(<ids>) (scripts/sync/pull.browser.js).
//   node scripts/sync/recheck-ids.js
const fs = require("fs"), path = require("path"), d = path.join(__dirname, "../../data/export/orders");
console.log(JSON.stringify(fs.readdirSync(d).map(f => JSON.parse(fs.readFileSync(path.join(d, f), "utf8")))
  .filter(o => !["Draft INV", "Cancel"].includes(o.status)).map(o => +o.legacyId).filter(Boolean)));
