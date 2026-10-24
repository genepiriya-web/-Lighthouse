// Browser tests at phone width (390 × 844) against the built app on a throwaway database (e2e/db.js).
// Run with `npm run test:e2e` (needs `npm run build` and a local Postgres).
import { defineConfig } from "@playwright/test";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { url } = require("./e2e/db.js");

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3921", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "th-TH" },
  webServer: {
    command: "npx next start -p 3921 -H 127.0.0.1",
    url: "http://127.0.0.1:3921/dev-login",
    reuseExistingServer: false,
    env: { DATABASE_URL: url(), LHD_AUTH: "dev", LHD_TRIAL_PINS: "", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
