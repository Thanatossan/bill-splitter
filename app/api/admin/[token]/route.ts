import { CATEGORIES, type Category } from "@/lib/types";
import {
  billForAdmin,
  cleanText,
  error,
  json,
  parseBahtToSatang,
  randomId,
  readJson,
} from "@/lib/server";
import { store } from "@/lib/store";
import { guestId } from "@/lib/seed-data";

async function adminPayload(token: string) {
  const bill = await billForAdmin(token);
  if (!bill) return null;
  return { bill, people: await store.getPeople(bill.id) };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/[token]">) {
  const { token } = await ctx.params;
  const payload = await adminPayload(token);
  return payload ? json(payload) : error("Not found", 404);
}

type Action =
  | { action: "settings"; locked?: boolean; title?: string; extraBaht?: number | string; extraLabel?: string; payment?: Record<string, string> }
  | { action: "addItem"; name: string; category: Category; qty: number; unitPriceBaht: number | string }
  | { action: "removeItem"; itemId: string }
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
      if (typeof body.locked === "boolean") bill.locked = body.locked;
      if (body.title !== undefined) bill.title = cleanText(body.title, 60) || bill.title;
      if (body.extraBaht !== undefined) {
        const s = parseBahtToSatang(body.extraBaht);
        if (s === null) return error("Invalid extra amount", 400);
        bill.extraSatang = s;
      }
      if (body.extraLabel !== undefined) bill.extraLabel = cleanText(body.extraLabel, 40) || "Tip";
      if (body.payment) {
        bill.payment = {
          promptpay: cleanText(body.payment.promptpay, 20).replace(/[^0-9]/g, ""),
          bankName: cleanText(body.payment.bankName, 40),
          accountNo: cleanText(body.payment.accountNo, 30),
          accountName: cleanText(body.payment.accountName, 60),
        };
      }
      break;
    }
    case "addItem": {
      const name = cleanText(body.name, 60);
      const qty = Math.floor(Number(body.qty));
      const price = parseBahtToSatang(body.unitPriceBaht);
      if (!name || !(qty >= 1 && qty <= 50) || !price || !CATEGORIES.includes(body.category))
        return error("Invalid item", 400);
      bill.items.push({
        id: `m-${randomId(6)}`,
        name,
        category: body.category,
        qty,
        unitPriceSatang: price,
        manual: true,
      });
      break;
    }
    case "removeItem": {
      const item = bill.items.find((i) => i.id === body.itemId);
      if (!item?.manual) return error("Only manual items can be removed", 400);
      bill.items = bill.items.filter((i) => i.id !== body.itemId);
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
