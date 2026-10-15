import { error, json, loadPayload, readJson } from "@/lib/server";
import { store } from "@/lib/store";

/** Toggle "shared by everyone" on an item (used for water). */
export async function PATCH(
  req: Request,
  ctx: RouteContext<"/api/b/[shareId]/items/[itemId]">,
) {
  const { shareId, itemId } = await ctx.params;
  const bill = await store.getBill(shareId);
  if (!bill) return error("Bill not found", 404);
  if (bill.locked) return error("The bill is locked", 423);
  const item = bill.items.find((i) => i.id === itemId);
  if (!item) return error("Item not found", 404);
  const body = await readJson<{ sharedByAll: boolean }>(req);
  item.sharedByAll = Boolean(body.sharedByAll);
  await store.putBill(bill);
  return json(await loadPayload(shareId));
}
