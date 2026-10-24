// POST /api/dev/pin { pin } — staff trial only: a right PIN sets the httpOnly `lhd_trial` cookie for 12 hours.
import { ApiError, handle, readJson } from "../../../../lib/server/http";
import { checkPin, devAuthOn, trialCookie, trialPin } from "../../../../lib/server/auth";

export const POST = handle(async (req: Request) => {
  if (!devAuthOn() || !trialPin()) throw new ApiError(404, "not_found");
  const b = await readJson(req);
  if (!checkPin(req, String(b.pin ?? ""))) throw new ApiError(401, "wrong_pin");
  return Response.json({ ok: true }, { headers: { "set-cookie": trialCookie() } });
});
