// A job's life on a 390 px phone screen, as each role: sale creates and prices it, store checks out, the CEO confirms
// the special price, store ships it. On every screen: no sideways scroll.
import { test, expect, type Page } from "@playwright/test";

const ID = { admin: "00000000-0000-4000-8000-000000000001", sale: "00000000-0000-4000-8000-000000000002", store: "00000000-0000-4000-8000-000000000003" };
async function as(page: Page, who: keyof typeof ID) {
  await page.context().addCookies([{ name: "lhd_dev_user", value: ID[who], url: "http://127.0.0.1:3921" }]);
}
// The page must neither scroll sideways nor cut content off: every visible element must end inside the screen, except
// inside strips built to scroll on their own (tabs, chips, stepper) — `overflow-x: hidden` on <html> would otherwise
// hide a too-wide layout from a plain scrollWidth check.
async function noSidewaysScroll(page: Page, where: string) {
  const r = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth; const bad: string[] = [];
    const scrolls = (el: Element | null): boolean => { for (let e = el; e && e !== document.body; e = e.parentElement) {
      const ox = getComputedStyle(e).overflowX; if (ox === "auto" || ox === "scroll") return true; } return false; };
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (b.right > cw + 1 && !scrolls(el.parentElement)) bad.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className || ""} right=${Math.round(b.right)}`);
    }
    return { cw, sw: document.documentElement.scrollWidth, bad: bad.slice(0, 5) };
  });
  expect(r.sw, `${where}: page scrolls sideways`).toBeLessThanOrEqual(r.cw);
  expect(r.bad, `${where}: content runs past the ${r.cw}px screen`).toEqual([]);
}

test("Thai by default; sign-in picker and jobs list fit the phone", async ({ page }) => {
  await page.goto("/dev-login");
  await expect(page.getByRole("heading", { name: /เลือกบทบาทเพื่อทดลองใช้/ })).toBeVisible();
  await noSidewaysScroll(page, "dev-login");
  await page.getByRole("button", { name: /Dev Sale/ }).click();
  await expect(page.getByRole("heading", { name: "งาน" })).toBeVisible();
  await expect(page.locator("a.jrow")).toHaveCount(2);
  await noSidewaysScroll(page, "jobs");
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
});

test("sale → store → CEO → store: special price blocks shipping until confirmed", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lhd-lang", "en"));
  await as(page, "sale");
  await page.goto("/jobs/new");
  await page.getByPlaceholder("Search customer name or code").fill("Synthetic");
  await expect(page.getByRole("option", { name: /Synthetic Films C10/ })).toBeVisible();
  await noSidewaysScroll(page, "new job (customer dropdown open)");
  await page.getByRole("option", { name: /Synthetic Films C10/ }).click();
  await page.locator("label", { hasText: "Job title" }).locator("input").fill("E2E phone job");
  await noSidewaysScroll(page, "new job");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E2E phone job" })).toBeVisible();
  await noSidewaysScroll(page, "job sheet (empty)");
  await expect(page.locator("label", { hasText: "Days per week" })).toHaveCount(0); // Daily: no days-per-week field (Gene, 27 Oct)
  await expect(page.getByPlaceholder("Search customer name or code")).toHaveValue("Synthetic Films");

  await page.getByPlaceholder("Search item name").fill("HMI");
  await page.locator(".res", { hasText: "Synthetic HMI 18K" }).getByRole("button", { name: "+" }).click();
  const price = page.locator(".lrow:not(.head)").first().locator("input").first();
  await expect(price).toHaveValue("24000");
  await price.fill("20000");
  await page.getByRole("button", { name: "Save items" }).click();
  await expect(page.getByText("Special prices need the CEO before shipping")).toBeVisible();
  await noSidewaysScroll(page, "job sheet (items)");

  await page.getByRole("button", { name: "Move to Order" }).click();
  await page.getByRole("button", { name: "Move to Approve" }).click();
  await expect(page.locator(".sheet-head .tape")).toHaveText("Approve");

  await as(page, "store"); await page.reload();
  await page.getByRole("button", { name: "All out" }).click();
  await expect(page.getByRole("button", { name: "Move to Shipped" })).toBeDisabled();
  await expect(page.getByText("The CEO must confirm the special prices first.")).toBeVisible();
  await noSidewaysScroll(page, "job sheet (store)");

  await as(page, "admin"); await page.reload();
  await page.getByRole("button", { name: "Confirm prices (CEO)" }).click();
  await expect(page.getByText(/Prices confirmed by Dev Admin/)).toBeVisible();

  await as(page, "store"); await page.reload();
  await page.getByRole("button", { name: "Move to Shipped" }).click();
  await expect(page.locator(".sheet-head .tape")).toHaveText("Shipped");
  await expect(page.locator("ul.log li").first()).toContainText("Dev Store");
  await noSidewaysScroll(page, "job sheet (shipped)");

  await page.getByRole("tab", { name: "Repairs" }).click();
  await expect(page.getByRole("heading", { name: "Repairs" })).toBeVisible();
  await noSidewaysScroll(page, "repairs");
});

test("master data screens fit the phone; sale checks a flagged customer; store updates stock", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lhd-lang", "en"));
  await as(page, "admin");
  for (const [path, heading] of [["/catalog", "Catalog"], ["/customers", "Customers"], ["/crew", "Crew rates"], ["/team", "Team"], ["/settings", "Settings"], ["/catalog/1", "M18 · Synthetic HMI 18K"]]) {
    await page.goto(path); await expect(page.getByRole("heading", { name: heading })).toBeVisible(); await noSidewaysScroll(page, path);
  }
  await as(page, "sale");
  await page.goto("/customers");
  await page.getByRole("button", { name: "New customers to check" }).click();
  await page.locator("a.jrow", { hasText: "Synthetic Films" }).click();
  await expect(page.getByText(/not in the old system's customer list/)).toBeVisible();
  await noSidewaysScroll(page, "customer (flagged)");
  await page.getByRole("button", { name: "Mark as checked" }).click();
  await expect(page.getByRole("button", { name: "Mark as checked" })).toHaveCount(0);

  await as(page, "store");
  await page.goto("/catalog/2");
  const stock = page.locator("label", { hasText: "Stock" }).locator("input");
  await stock.fill("12");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Edited in v2")).toBeVisible();
  await expect(stock).toHaveValue("12");
  await noSidewaysScroll(page, "catalog item (store)");
});

test("store view, cockpit sections and job documents fit the phone; documents download", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lhd-lang", "en"));
  await as(page, "store");
  await page.goto("/store"); await expect(page.getByRole("heading", { name: "Store" })).toBeVisible(); await noSidewaysScroll(page, "store");
  await page.goto("/cockpit"); await expect(page.getByText("Your role can't do this step.")).toBeVisible();
  await as(page, "admin");
  await page.goto("/cockpit"); await expect(page.getByRole("heading", { name: "Cockpit" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Overbooked/ })).toBeVisible(); await noSidewaysScroll(page, "cockpit problems");
  for (const s of ["Money", "Equipment"]) { await page.getByRole("button", { name: s, exact: true }).click(); await noSidewaysScroll(page, `cockpit ${s}`); }
  await page.goto("/jobs/6900001");
  await page.getByText("Preview").click();
  await expect(page.frameLocator("iframe").getByText("QUOTATION / ใบเสนอราคา")).toBeVisible();
  await noSidewaysScroll(page, "job documents");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download .html" }).click()]);
  expect(dl.suggestedFilename()).toBe("6900001-quotation.html");
});

test("crew IDs on a phone: admin imports (masked), shows one (logged), sends a link; the client sees IDs only after tapping", async ({ page, browser }) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { syntheticId } = require("../tests/helpers/fixture");
  const id: string = syntheticId(777); const fmt = `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}`; const masked = `x-xxxx-xxxxx-${id.slice(10, 12)}-${id[12]}`;
  await page.addInitScript(() => localStorage.setItem("lhd-lang", "en"));
  await as(page, "admin");
  await page.goto("/crew/ids");
  await page.locator("textarea").fill(`G01, ${id}`);
  await page.getByRole("button", { name: "Check matches" }).click();
  await expect(page.getByText(masked)).toBeVisible(); await expect(page.getByText(fmt)).toHaveCount(0);
  await noSidewaysScroll(page, "crew id import");
  await page.getByRole("button", { name: /^Save 1/ }).click();
  await page.goto("/crew?q=Test");
  await expect(page.getByText(masked).first()).toBeVisible();
  await page.getByRole("button", { name: "Show" }).first().click();
  await expect(page.getByText(fmt)).toBeVisible();
  await noSidewaysScroll(page, "crew rates with IDs");

  await page.goto("/jobs/6900001");
  await page.getByLabel("Who is this for?").fill("Production X location manager");
  await page.getByRole("button", { name: "Create link" }).click();
  const url = await page.locator("input[readonly]").inputValue();
  expect(url).toMatch(/\/share\/crew\/[A-Za-z0-9_-]{40,}$/);
  await noSidewaysScroll(page, "job crew links");

  const client = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); // a stranger: no sign-in
  await client.goto(url);
  await expect(client.getByRole("button", { name: /Show crew list/ })).toBeVisible();
  expect(await client.content()).not.toContain(fmt);
  await client.getByRole("button", { name: /Show crew list/ }).click();
  await expect(client.getByText(fmt)).toBeVisible();
  await noSidewaysScroll(client, "client crew list");
  await page.reload();
  await expect(page.getByText(/1\/20 views/)).toBeVisible();
});

test("bug report on a phone: pick a type, send from the page you're on; the admin sees it with its details", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lhd-lang", "en"));
  await as(page, "store"); await page.goto("/store");
  await page.getByRole("button", { name: "Feedback" }).click();
  await page.getByRole("button", { name: "Confusing" }).click();
  await expect(page.getByRole("button", { name: "Confusing" })).toHaveAttribute("aria-pressed", "true");
  await page.locator("textarea").fill("Where is the return button?");
  await noSidewaysScroll(page, "feedback form");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thank you — sent.")).toBeVisible();
  await as(page, "admin"); await page.goto("/feedback");
  const row = page.locator(".jrow", { hasText: "Where is the return button?" });
  await expect(row).toContainText("Confusing"); await expect(row).toContainText("/store"); await expect(row).toContainText("390×844");
  await noSidewaysScroll(page, "feedback list");
  await page.getByRole("button", { name: "Bug" }).click(); await expect(row).toHaveCount(0);
});
