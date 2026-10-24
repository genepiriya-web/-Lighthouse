// POST /api/dev/pin { pin } — staff trial: the PIN names the department; sets the signed httpOnly `lhd_trial` cookie for 12 h.
// DELETE /api/dev/pin — sign out of the trial.
import { ApiError, handle, readJson } from "../../../../lib/server/http";
import { checkPin, clearTrialCookie, devAuthOn, trialCookie, trialOn } from "../../../../lib/server/auth";

export const POST = handle(async (req: Request) => {
  if (!devAuthOn() || !trialOn()) throw new ApiError(404, "not_found");
  const b = await readJson(req); const dept = checkPin(req, String(b.pin ?? ""));
  if (!dept) throw new ApiError(401, "wrong_pin");
  return Response.json({ dept }, { headers: { "set-cookie": trialCookie(dept) } });
});
export const DELETE = handle(async () => Response.json({ ok: true }, { headers: { "set-cookie": clearTrialCookie } }));
