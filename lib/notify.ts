import type { Contact, NotifyLog } from "./types";

/**
 * Rough Twilio price for one SMS segment to a Thai mobile, in satang. Only
 * used to show the host an estimate before sending.
 */
export const SMS_SEGMENT_COST_SATANG = 110;

/** "THB 1,240": ASCII, so a Latin-only message stays in cheap GSM-7. */
export const asciiTHB = (satang: number) =>
  "THB " +
  (satang / 100).toLocaleString("en-US", {
    minimumFractionDigits: satang % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });

/** Link a friend straight to their own total. */
export const friendUrl = (base: string, billId: string, guestId: string) =>
  `${base.replace(/\/$/, "")}/b/${billId}?me=${encodeURIComponent(guestId)}`;

/**
 * The "bill is ready" message. Without a URL (when links in SMS aren't
 * approved yet) it points friends to the link they already have.
 */
export function notifyText({
  title,
  name,
  amountSatang,
  url,
  host,
}: {
  title: string;
  name: string;
  amountSatang: number;
  url?: string | null;
  host?: string;
}): string {
  const head = `${title.trim()} is final. ${name.trim()} owes ${asciiTHB(amountSatang)}.`;
  if (url) return `${head} Pay: ${url}`;
  return `${head} Open the bill link from ${host?.trim() || "the group chat"}.`;
}

// GSM 03.38 basic character set; the extension table costs two characters each.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€\f";

export interface SegmentInfo {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as the carrier counts them (septets or UTF-16 units). */
  length: number;
  segments: number;
}

/**
 * How many SMS segments `text` costs. GSM-7 fits 160 per message (153 per part
 * when split); anything else (Thai, ฿, emoji) switches to UCS-2 at 70 (67).
 */
export function smsSegments(text: string): SegmentInfo {
  let septets = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) septets += 1;
    else if (GSM_EXT.includes(ch)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    return { encoding: "GSM-7", length: septets, segments: septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153) };
  }
  // UCS-2 counts UTF-16 code units, so an emoji takes two.
  const units = text.length;
  return { encoding: "UCS-2", length: units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}

export interface Recipient {
  id: string;
  name: string;
  phone: string;
}

/**
 * Who gets an automatic SMS: people with a phone number who haven't been
 * texted successfully yet. Passing `only` (the host tapped Resend) texts
 * exactly those guests again, as long as they have a number. Guests who owe
 * nothing are skipped when `owed` is given.
 */
export function pickRecipients(
  people: { id: string; name: string }[],
  contacts: Record<string, Contact>,
  notified: Record<string, NotifyLog>,
  opts: { only?: string[]; owed?: Record<string, number> } = {},
): Recipient[] {
  const only = opts.only ? new Set(opts.only) : null;
  return people.flatMap((g) => {
    const phone = contacts[g.id]?.phone;
    if (!phone) return [];
    if (opts.owed && !(opts.owed[g.id] > 0)) return [];
    if (only ? !only.has(g.id) : notified[g.id]?.status === "sent") return [];
    return [{ id: g.id, name: g.name, phone }];
  });
}
