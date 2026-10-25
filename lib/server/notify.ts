// Announces new reports in a Discord channel (level 1 bug reporting, Gene 25 Oct 2026).
//   * DISCORD_WEBHOOK_URL — the channel's webhook, set by Gene in .env.local / hosting settings (it's a secret: anyone with
//     it can post to the channel). Anything that isn't a discord.com webhook is ignored, so a typo can't send reports elsewhere.
//   * No customer data leaves: Discord gets the type, page, department, time, report number and a link back. The staff
//     member's text is included only with DISCORD_INCLUDE_TEXT=1 (it may name customers; Discord is a foreign service).
//   * Reports are saved first. Delivery is an outbox: unsent rows are retried on the next report or when an admin opens the
//     list, each row claimed with a row lock so two requests never send the same report twice.
import "server-only";
import { tx } from "./db";

const DISCORD = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
export function webhookUrl(): string | null {
  const u = (process.env.DISCORD_WEBHOOK_URL ?? "").trim(); if (!u) return null;
  if (DISCORD.test(u)) return u;
  // tests only: a local fake Discord, under the local dev sign-in
  if (process.env.LHD_AUTH === "dev" && /^http:\/\/127\.0\.0\.1:\d+\/api\/webhooks\/[\w/-]+$/.test(u)) return u;
  return null;
}

const LABEL: Record<string, string> = { bug: "🐞 บั๊ก · Bug", confusing: "😕 งง · Confusing", idea: "💡 อยากได้ · Idea", other: "💬 ความเห็น · Feedback" };
const COLOR: Record<string, number> = { bug: 0xb8342a, confusing: 0x9a5a00, idea: 0x2f6fd6, other: 0x566170 };
const MAX_TRIES = 20;

export function discordMessage(f: { id: number; at: string | Date; kind: string; page: string | null; user_name: string | null; role: string | null; text: string }) {
  const base = (process.env.LHD_PUBLIC_URL ?? "").replace(/\/+$/, "");
  const withText = process.env.DISCORD_INCLUDE_TEXT === "1";
  return {
    username: "Lighthouse Dispatch",
    allowed_mentions: { parse: [] as string[] }, // never ping @everyone/@here or anyone, whatever the text says
    embeds: [{
      title: `${LABEL[f.kind] ?? LABEL.other} · #${f.id}`,
      color: COLOR[f.kind] ?? COLOR.other,
      ...(base && /^https?:\/\//.test(base) && { url: `${base}/feedback#f${f.id}` }),
      ...(withText && { description: f.text.length > 300 ? f.text.slice(0, 300) + "…" : f.text }),
      fields: [
        { name: "หน้า · Page", value: (f.page || "—").slice(0, 200), inline: true },
        { name: "ฝ่าย · Dept", value: (f.user_name || f.role || "—").slice(0, 100), inline: true },
      ],
      timestamp: new Date(f.at).toISOString(),
      footer: { text: withText ? "Lighthouse Dispatch" : "รายละเอียดอยู่ในระบบ · Details are in the app (Feedback)" },
    }],
  };
}

/** Send what hasn't been sent yet (up to `max` reports). Never throws; failures are recorded on the row. */
export async function deliverPending(max = 10): Promise<number> {
  const url = webhookUrl(); if (!url) return 0;
  let sent = 0;
  for (let i = 0; i < max; i++) {
    const done = await tx(async c => {
      const f = (await c.query(`select id, at, kind, page, user_name, role, text from feedback
        where notified_at is null and notify_tries < $1 order by at limit 1 for update skip locked`, [MAX_TRIES])).rows[0];
      if (!f) return null;
      let error: string | null = null;
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(discordMessage(f)), signal: AbortSignal.timeout(5000) });
        if (!r.ok) error = `HTTP ${r.status}`;
      } catch (e) { error = (e as Error).name === "TimeoutError" ? "timeout" : "network error"; }
      if (error) await c.query("update feedback set notify_tries = notify_tries + 1, notify_error = $2 where id = $1", [f.id, error]);
      else await c.query("update feedback set notified_at = now(), notify_error = null, notify_tries = notify_tries + 1 where id = $1", [f.id]);
      return error ? "failed" : "sent";
    }).catch(() => "failed" as const);
    if (done === null || done === "failed") break; // nothing left, or Discord is down: try again later
    sent++;
  }
  return sent;
}
