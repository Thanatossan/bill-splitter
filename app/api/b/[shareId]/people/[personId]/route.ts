import { expandUnits } from "@/lib/money";
import { cleanText, error, json, loadPayload, readJson } from "@/lib/server";
import { store } from "@/lib/store";

/** A friend saves (or updates) their own selection. */
export async function PUT(
  req: Request,
  ctx: RouteContext<"/api/b/[shareId]/people/[personId]">,
) {
  const { shareId, personId } = await ctx.params;
  const bill = await store.getBill(shareId);
  if (!bill) return error("Bill not found", 404);
  if (bill.locked) return error("The bill is locked", 423);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(personId)) return error("Bad person id", 400);

  const body = await readJson<{ name: string; unitIds: string[] }>(req);
  // Guests on the list always save under their listed name.
  const guest = bill.roster?.find((g) => g.id === personId);
  const name = guest?.name ?? cleanText(body.name, 40);
  if (!name) return error("Name is required", 400);

  const valid = new Set(expandUnits(bill.items).map((u) => u.id));
  const unitIds = Array.isArray(body.unitIds)
    ? [...new Set(body.unitIds.filter((id): id is string => typeof id === "string" && valid.has(id)))]
    : [];

  const existing = await store.getPerson(shareId, personId);
  await store.putPerson(shareId, {
    id: personId,
    name,
    unitIds,
    paid: existing?.paid ?? false,
    updatedAt: Date.now(),
  });
  return json(await loadPayload(shareId));
}
