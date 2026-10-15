import { error, json, readJson } from "@/lib/server";
import { store } from "@/lib/store";
import { parseContact } from "@/lib/validate";

/**
 * A friend leaves their own mobile number so the host can tell them when the
 * bill is final. Write-only: numbers are never sent back on the share link,
 * only to the host's admin page. An empty number removes it.
 */
export async function PUT(
  req: Request,
  ctx: RouteContext<"/api/b/[shareId]/people/[personId]/contact">,
) {
  const { shareId, personId } = await ctx.params;
  const bill = await store.getBill(shareId);
  if (!bill) return error("Bill not found", 404);
  const known =
    bill.roster?.some((g) => g.id === personId) || (await store.getPerson(shareId, personId)) !== null;
  if (!known) return error("Pick your name first", 404);

  const contact = parseContact(await readJson<{ phone: string }>(req));
  if (typeof contact === "string") return error(contact, 400);
  await store.putContact(shareId, personId, contact);
  return json({ saved: contact !== null });
}
