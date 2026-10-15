import { guestId } from "./seed-data";
import { cleanText, parseBahtToSatang, randomId } from "./server";
import { normalizeThaiPhone } from "./phone";
import { CATEGORIES, THEME_COLORS, type Bill, type Category, type Contact, type Guest, type Item, type ThemeColor } from "./types";

export interface ItemInput {
  id?: string;
  name?: unknown;
  category?: unknown;
  qty?: unknown;
  unitPriceBaht?: unknown;
  sharedByAll?: unknown;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 32) || "item";

/**
 * Validate a full item list. Items whose `id` matches an existing item keep
 * that id, so friends' ticks survive edits to name, price or category.
 */
export function parseItems(raw: unknown, existing: Item[] = []): Item[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "Add at least one item";
  if (raw.length > 200) return "Too many items (max 200)";
  const byId = new Map(existing.map((i) => [i.id, i]));
  const used = new Set<string>();
  const items: Item[] = [];
  for (const [n, r] of (raw as ItemInput[]).entries()) {
    const name = cleanText(r?.name, 80);
    const qty = Number(r?.qty);
    const price = parseBahtToSatang(r?.unitPriceBaht);
    if (!name) return `Item ${n + 1} needs a name`;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return `${name}: quantity must be 1–99`;
    if (!price) return `${name}: price must be more than 0`;
    const prev = typeof r.id === "string" ? byId.get(r.id) : undefined;
    let id = prev && !used.has(prev.id) ? prev.id : `${slug(name)}-${randomId(3)}`;
    while (used.has(id)) id = `${slug(name)}-${randomId(3)}`;
    used.add(id);
    items.push({
      id,
      name,
      category: CATEGORIES.includes(r.category as Category) ? (r.category as Category) : "food",
      qty,
      unitPriceSatang: price,
      ...(r.sharedByAll ? { sharedByAll: true } : {}),
    });
  }
  return items;
}

/** Validate guest names, keeping ids of names already on the list. */
export function parseRoster(raw: unknown, existing: Guest[] = []): Guest[] | string {
  if (!Array.isArray(raw)) return "Guest list must be a list of names";
  if (raw.length > 60) return "Too many guests (max 60)";
  const roster: Guest[] = [];
  const seen = new Set<string>();
  let next = Math.max(0, ...existing.map((g) => Number(g.id.replace(/\D/g, "")) || 0)) + 1;
  for (const r of raw) {
    const name = cleanText(r, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const prev = existing.find((g) => g.name.toLowerCase() === name.toLowerCase());
    roster.push(prev ? { id: prev.id, name } : { id: guestId(next++), name });
  }
  return roster;
}

export interface SettingsInput {
  title?: unknown;
  emoji?: unknown;
  color?: unknown;
  date?: unknown;
  receiptTotalBaht?: unknown;
  serviceChargePct?: unknown;
  vatAdded?: unknown;
  extraBaht?: unknown;
  extraLabel?: unknown;
  locked?: unknown;
  payment?: Record<string, unknown>;
}

/** Apply any provided settings to `bill` in place. Returns an error message or null. */
export function applySettings(bill: Bill, s: SettingsInput): string | null {
  if (typeof s.locked === "boolean") bill.locked = s.locked;
  if (s.title !== undefined) bill.title = cleanText(s.title, 60) || bill.title;
  if (s.emoji !== undefined) bill.emoji = cleanText(s.emoji, 8);
  if (s.color !== undefined) {
    if (!THEME_COLORS.includes(s.color as ThemeColor)) return "Unknown color";
    bill.color = s.color as ThemeColor;
  }
  if (s.date !== undefined) {
    if (typeof s.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return "Date must be YYYY-MM-DD";
    bill.date = s.date;
  }
  if (s.receiptTotalBaht !== undefined) {
    const v = s.receiptTotalBaht === "" ? 0 : parseBahtToSatang(s.receiptTotalBaht);
    if (v === null) return "Invalid receipt total";
    bill.receiptTotalSatang = v;
  }
  if (s.serviceChargePct !== undefined) {
    const pct = s.serviceChargePct === "" ? 0 : Number(s.serviceChargePct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 30) return "Service charge must be 0–30%";
    bill.serviceBp = Math.round(pct * 100);
  }
  if (s.vatAdded !== undefined) bill.vatBp = s.vatAdded ? 700 : 0;
  if (s.extraBaht !== undefined) {
    const v = s.extraBaht === "" ? 0 : parseBahtToSatang(s.extraBaht);
    if (v === null) return "Invalid tip / extra amount";
    bill.extraSatang = v;
  }
  if (s.extraLabel !== undefined) bill.extraLabel = cleanText(s.extraLabel, 40) || "Tip";
  if (s.payment) {
    bill.payment = {
      promptpay: cleanText(s.payment.promptpay, 20).replace(/[^0-9]/g, ""),
      bankName: cleanText(s.payment.bankName, 40),
      accountNo: cleanText(s.payment.accountNo, 30),
      accountName: cleanText(s.payment.accountName, 60),
    };
  }
  return null;
}

/** Validate a friend's phone. Empty means "remove it" (null). */
export function parseContact(raw: { phone?: unknown }): Contact | null | string {
  const text = cleanText(raw.phone, 30);
  if (!text) return null;
  const phone = normalizeThaiPhone(text);
  return phone ? { phone } : "Phone must be a Thai mobile number, like 081-234-5678";
}
