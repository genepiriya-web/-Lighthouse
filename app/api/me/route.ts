// GET /api/me — the caller's staff record (role decides what the UI shows; the server still checks every write).
import { handle } from "../../../lib/server/http";
import { requireStaff, trialPin } from "../../../lib/server/auth";
import { tx } from "../../../lib/server/db";

// `trial: true` while the staff trial runs (LHD_TRIAL_PIN set): the screens then show the trial banner on every page.
export const GET = handle(async (req: Request) => Response.json({ ...(await tx(c => requireStaff(c, req))), trial: !!trialPin() }));
