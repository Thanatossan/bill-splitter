/**
 * Automatic SMS through Twilio's REST API (no SDK, one fetch per message).
 * To switch providers (e.g. ThaiBulkSMS), replace `sendSms` and `smsEnabled`.
 */

const sid = () => process.env.TWILIO_ACCOUNT_SID;
const authToken = () => process.env.TWILIO_AUTH_TOKEN;
const messagingService = () => process.env.TWILIO_MESSAGING_SERVICE_SID;
const from = () => process.env.TWILIO_FROM;

export const smsEnabled = () => Boolean(sid() && authToken() && (messagingService() || from()));

/**
 * Base URL for links in SMS, or null to send without a link (Thailand needs
 * every URL approved by Twilio/NBTC; short links are banned). Prefers a fixed
 * approved domain over whatever host the admin page was opened on.
 */
export function smsLinkBase(requestOrigin: string): string | null {
  if (process.env.SMS_LINKS === "off") return null;
  return process.env.SMS_LINK_BASE_URL || requestOrigin;
}

/** Who link-less messages say the bill link came from. */
export const smsHostName = () => process.env.SMS_HOST_NAME || undefined;

export type SmsResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!smsEnabled()) return { ok: false, error: "SMS is not configured" };
  const form = new URLSearchParams({ To: to, Body: body });
  const service = messagingService();
  if (service) form.set("MessagingServiceSid", service);
  else form.set("From", from()!);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid()}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid()}:${authToken()}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (res.ok && data.sid) return { ok: true, id: data.sid };
    const detail = data.message ?? `HTTP ${res.status}`;
    return { ok: false, error: (data.code ? `${detail} (${data.code})` : detail).slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
