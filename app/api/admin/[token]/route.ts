import { billForAdmin, cleanText, error, json, readJson } from "@/lib/server";
import { store } from "@/lib/store";
import { aiEnabled } from "@/lib/host-auth";
import { guestId } from "@/lib/seed-data";
import { applySettings, parseItems, type SettingsInput } from "@/lib/validate";
import { billCharges, computeBill, withRoster } from "@/lib/money";
import { friendUrl, notifyText, pickRecipients } from "@/lib/notify";
import { sendSms, smsEnabled, smsHostName, smsLinkBase } from "@/lib/sms";
import type { NotifyLog } from "@/lib/types";

/** Each guest can be texted about 3 times a day per bill (first send + resends). */
const SMS_PER_GUEST_PER_DAY = 3;

async function adminPayload(token: string, origin: string) {
  const bill = await billForAdmin(token);
  if (!bill) return null;
  const [people, contacts, notified] = await Promise.all([
    store.getPeople(bill.id),
    store.getContacts(bill.id),
    store.getNotified(bill.id),
  ]);
  const sms = smsEnabled();
  return {
    bill,
    people,
    aiEnabled: aiEnabled(),
    contacts,
    notified,
    smsEnabled: sms,
    // What the automatic SMS will look like, so the host sees the real cost.
    smsLinkBase: sms ? smsLinkBase(origin) : null,
    smsHostName: sms ? smsHostName() : undefined,
  };
}

export async function GET(req: Request, ctx: RouteContext<"/api/admin/[token]">) {
  const { token } = await ctx.params;
  const payload = await adminPayload(token, new URL(req.url).origin);
  return payload ? json(payload) : error("Not found", 404);
}

type Action =
  | ({ action: "settings" } & SettingsInput)
  | { action: "replaceItems"; items: unknown }
  | { action: "itemShared"; itemId: string; sharedByAll: boolean }
  | { action: "paid"; personId: string; paid: boolean }
  | { action: "removePerson"; personId: string }
  | { action: "addGuest"; name: string }
  | { action: "removeGuest"; guestId: string }
  | { action: "notify"; guestIds?: unknown };

export async function POST(req: Request, ctx: RouteContext<"/api/admin/[token]">) {
  const { token } = await ctx.params;
  const bill = await billForAdmin(token);
  if (!bill) return error("Not found", 404);
  const body = (await readJson<Action>(req)) as Action;
  const origin = new URL(req.url).origin;

  switch (body.action) {
    case "settings": {
      const problem = applySettings(bill, body);
      if (problem) return error(problem, 400);
      break;
    }
    case "replaceItems": {
      // Ticks on removed items (or units beyond a lowered qty) are simply ignored.
      const items = parseItems(body.items, bill.items);
      if (typeof items === "string") return error(items, 400);
      bill.items = items;
      break;
    }
    case "itemShared": {
      const item = bill.items.find((i) => i.id === body.itemId);
      if (!item) return error("Item not found", 404);
      item.sharedByAll = Boolean(body.sharedByAll);
      break;
    }
    case "paid": {
      const guest = bill.roster?.find((g) => g.id === body.personId);
      const p =
        (await store.getPerson(bill.id, body.personId)) ??
        // A guest who hasn't picked yet can still pay (e.g. for shared water).
        (guest && { id: guest.id, name: guest.name, unitIds: [], paid: false, updatedAt: Date.now() });
      if (!p) return error("Person not found", 404);
      await store.putPerson(bill.id, { ...p, paid: Boolean(body.paid) });
      return json(await adminPayload(token, origin));
    }
    case "removePerson": {
      await store.deletePerson(bill.id, body.personId);
      // Someone not on the guest list is gone entirely, number included.
      if (!bill.roster?.some((g) => g.id === body.personId)) await store.putContact(bill.id, body.personId, null);
      return json(await adminPayload(token, origin));
    }
    case "addGuest": {
      const name = cleanText(body.name, 40);
      if (!name) return error("Name is required", 400);
      const roster = (bill.roster ??= []);
      if (roster.some((g) => g.name.toLowerCase() === name.toLowerCase()))
        return error(`${name} is already on the list`, 400);
      const next = Math.max(0, ...roster.map((g) => Number(g.id.replace(/\D/g, "")) || 0)) + 1;
      roster.push({ id: guestId(next), name });
      break;
    }
    case "removeGuest": {
      // Anything they already saved is kept and shows up as an off-list person.
      bill.roster = (bill.roster ?? []).filter((g) => g.id !== body.guestId);
      await store.putContact(bill.id, body.guestId, null);
      break;
    }
    case "notify": {
      if (!smsEnabled()) return error("SMS isn't set up on this server", 400);
      if (!bill.locked) return error("Lock the bill before texting friends", 400);
      const roster = bill.roster ?? [];
      const [people, contacts, notified] = await Promise.all([
        store.getPeople(bill.id),
        store.getContacts(bill.id),
        store.getNotified(bill.id),
      ]);
      // Amounts come from the server's own calculation, never from the client.
      const result = computeBill(bill.items, withRoster(roster, people), billCharges(bill));
      const owed = Object.fromEntries(result.people.map((p) => [p.id, p.paid ? 0 : p.roundedSatang]));
      const only = Array.isArray(body.guestIds)
        ? body.guestIds.filter((id): id is string => typeof id === "string")
        : undefined;
      // Everyone on the bill, including friends who typed a name not on the list.
      const recipients = pickRecipients(result.people, contacts, notified, { only, owed });
      if (recipients.length === 0) return error("Nobody to text: everyone with a number has been texted or has paid", 400);

      const capKey = `rl:sms:${bill.id}`;
      const cap = Math.max(10, SMS_PER_GUEST_PER_DAY * result.people.length);
      if ((await store.count(capKey)) + recipients.length > cap)
        return error(`Daily SMS limit for this bill reached (${cap}). Try again tomorrow.`, 429);

      const base = smsLinkBase(origin);
      // Sent before responding (not in after()) so the host sees each result.
      await Promise.allSettled(
        recipients.map(async (r) => {
          await store.bump(capKey, 86400);
          const text = notifyText({
            title: bill.title,
            name: r.name,
            amountSatang: owed[r.id],
            url: base && friendUrl(base, bill.id, r.id),
            host: smsHostName(),
          });
          const sent = await sendSms(r.phone, text);
          const log: NotifyLog = sent.ok
            ? { at: Date.now(), status: "sent" }
            : { at: Date.now(), status: "failed", error: sent.error };
          await store.putNotified(bill.id, r.id, log);
        }),
      );
      return json(await adminPayload(token, origin));
    }
    default:
      return error("Unknown action", 400);
  }
  await store.putBill(bill);
  return json(await adminPayload(token, origin));
}
