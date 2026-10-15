import { billForAdmin, cleanText, error, json, readJson } from "@/lib/server";
import { store } from "@/lib/store";
import { aiEnabled } from "@/lib/host-auth";
import { guestId } from "@/lib/seed-data";
import { applySettings, parseItems, type SettingsInput } from "@/lib/validate";

async function adminPayload(token: string) {
  const bill = await billForAdmin(token);
  if (!bill) return null;
  return { bill, people: await store.getPeople(bill.id), aiEnabled: aiEnabled() };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/[token]">) {
  const { token } = await ctx.params;
  const payload = await adminPayload(token);
  return payload ? json(payload) : error("Not found", 404);
}

type Action =
  | ({ action: "settings" } & SettingsInput)
  | { action: "replaceItems"; items: unknown }
  | { action: "itemShared"; itemId: string; sharedByAll: boolean }
  | { action: "paid"; personId: string; paid: boolean }
  | { action: "removePerson"; personId: string }
  | { action: "addGuest"; name: string }
  | { action: "removeGuest"; guestId: string };

export async function POST(req: Request, ctx: RouteContext<"/api/admin/[token]">) {
  const { token } = await ctx.params;
  const bill = await billForAdmin(token);
  if (!bill) return error("Not found", 404);
  const body = (await readJson<Action>(req)) as Action;

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
      return json(await adminPayload(token));
    }
    case "removePerson": {
      await store.deletePerson(bill.id, body.personId);
      return json(await adminPayload(token));
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
      break;
    }
    default:
      return error("Unknown action", 400);
  }
  await store.putBill(bill);
  return json(await adminPayload(token));
}
