import { requireHost } from "@/lib/host-auth";
import { createBill, error, json, readJson } from "@/lib/server";
import { applySettings, parseItems, parseRoster, type SettingsInput } from "@/lib/validate";
import type { Bill } from "@/lib/types";

type Body = SettingsInput & { passcode?: string; guests?: unknown; items?: unknown };

/** The host creates a new bill from the "New bill" page. */
export async function POST(req: Request) {
  const body = (await readJson<Body>(req)) as Body;
  const denied = await requireHost(req, body.passcode);
  if (denied) return denied;

  const items = parseItems(body.items);
  if (typeof items === "string") return error(items, 400);
  const roster = parseRoster(body.guests ?? []);
  if (typeof roster === "string") return error(roster, 400);

  const draft = { title: "Party", extraSatang: 0, extraLabel: "Tip", payment: {} } as Bill;
  const problem = applySettings(draft, { ...body, locked: false });
  if (problem) return error(problem, 400);

  const bill = await createBill({
    title: draft.title,
    date: draft.date ?? new Date().toISOString().slice(0, 10),
    emoji: draft.emoji,
    color: draft.color,
    serviceBp: draft.serviceBp ?? 0,
    vatBp: draft.vatBp ?? 0,
    receiptTotalSatang: draft.receiptTotalSatang ?? 0,
    extraSatang: draft.extraSatang,
    extraLabel: draft.extraLabel,
    ...(body.payment ? { payment: draft.payment } : {}),
    items,
    roster,
    guests: roster.length,
  });
  return json({ id: bill.id, adminToken: bill.adminToken }, 201);
}
