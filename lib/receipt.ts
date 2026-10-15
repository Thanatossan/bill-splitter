import type { Category } from "./types";

/** An editable receipt line before it becomes an Item (prices in baht). */
export interface DraftItem {
  key: string;
  /** Present when editing an existing item, so friends' ticks are kept. */
  id?: string;
  name: string;
  category: Category;
  qty: string;
  price: string;
  sharedByAll?: boolean;
}

const RULES: [Category, RegExp][] = [
  ["water", /\b(still|sparkling|mineral)?\s*water\b|น้ำเปล่า|น้ำแร่|โซดา\b/i],
  [
    "alcohol",
    /beer|wine|pint|lager|ipa|ale\b|stout|cider|cocktail|whisk(e)?y|vodka|gin\b|rum\b|tequila|soju|sake|highball|shot\b|bottle|\(tap\)|sangria|prosecco|champagne|mojito|margarita|negroni|เบียร์|ไวน์|เหล้า|ค็อกเทล|โซจู|สาเก/i,
  ],
  [
    "drinks",
    /juice|soda|coke|cola|sprite|pepsi|coffee|latte|espresso|cappuccino|americano|mocha|tea\b|matcha|lemonade|smoothie|shake|frappe|pop\b|tonic|kombucha|ชา|กาแฟ|น้ำ|โกโก้|นม/i,
  ],
];

export function guessCategory(name: string): Category {
  for (const [cat, re] of RULES) if (re.test(name)) return cat;
  return "food";
}

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const num = (s: string) => Number(s.replace(/,/g, ""));

/**
 * Parse pasted receipt text, one item per line. Understands:
 *   Chicken Wings 2 x 190      Chicken Wings x2 190     2x Chicken Wings 190
 *   Chicken Wings 2 190        Chicken Wings 190         Chicken Wings, 2, 190
 * The last number is the unit price, or the line total when `lineTotals` is
 * set (then it's divided by qty). Repeated name+price lines are merged.
 */
export function parseReceiptText(
  text: string,
  opts: { lineTotals?: boolean } = {},
): { items: Omit<DraftItem, "key">[]; skipped: string[] } {
  const items: Omit<DraftItem, "key">[] = [];
  const skipped: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/[\t;|]+|,(?=\s)/g, " ") // "name, 2, 190" -> "name 2 190"; keeps "1,290"
      .replace(/^[\s\-•*·]+/, "")
      .replace(/\s*(฿|thb|baht|บาท)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;

    let m: RegExpMatchArray | null;
    let name = "";
    let qty = 1;
    let amount = NaN;
    if ((m = line.match(new RegExp(String.raw`^(.+?) (\d{1,2}) ?[x×*] ?${NUM}$`, "i")))) {
      [name, qty, amount] = [m[1], Number(m[2]), num(m[3])];
    } else if ((m = line.match(new RegExp(String.raw`^(.+?) [x×*] ?(\d{1,2}) ${NUM}$`, "i")))) {
      [name, qty, amount] = [m[1], Number(m[2]), num(m[3])];
    } else if ((m = line.match(new RegExp(String.raw`^(\d{1,2}) ?[x×*]? (.+?) ${NUM}$`, "i")))) {
      [name, qty, amount] = [m[2], Number(m[1]), num(m[3])];
    } else if ((m = line.match(new RegExp(String.raw`^(.+?) (\d{1,2}) ${NUM}$`)))) {
      [name, qty, amount] = [m[1], Number(m[2]), num(m[3])];
    } else if ((m = line.match(new RegExp(String.raw`^(.+?) ${NUM}$`)))) {
      [name, amount] = [m[1], num(m[2])];
    }
    name = name.replace(/[\s:.\-–]+$/, "").trim();
    if (!name || !(qty >= 1) || !(amount > 0)) {
      skipped.push(raw.trim());
      continue;
    }
    const unit = opts.lineTotals ? Math.round((amount / qty) * 100) / 100 : amount;
    const price = String(unit);
    const same = items.find((i) => i.name.toLowerCase() === name.toLowerCase() && i.price === price);
    if (same) same.qty = String(Number(same.qty) + qty);
    else items.push({ name, category: guessCategory(name), qty: String(qty), price });
  }
  return { items, skipped };
}

export const newKey = () => Math.random().toString(36).slice(2, 10);

export function toDraft(item: {
  id: string;
  name: string;
  category: Category;
  qty: number;
  unitPriceSatang: number;
  sharedByAll?: boolean;
}): DraftItem {
  return {
    key: item.id,
    id: item.id,
    name: item.name,
    category: item.category,
    qty: String(item.qty),
    price: String(item.unitPriceSatang / 100),
    sharedByAll: item.sharedByAll,
  };
}

/** Shape the API expects for item lists (validated again on the server). */
export const toPayload = (items: DraftItem[]) =>
  items
    .filter((i) => i.name.trim() || i.price.trim())
    .map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      qty: Number(i.qty),
      unitPriceBaht: i.price.replace(/,/g, ""),
      sharedByAll: i.sharedByAll,
    }));

/** Sum of qty × price in satang, ignoring rows that aren't valid yet. */
export const draftTotalSatang = (items: DraftItem[]) =>
  items.reduce((s, i) => {
    const q = Number(i.qty);
    const p = Math.round(Number(i.price.replace(/,/g, "")) * 100);
    return Number.isFinite(q) && Number.isFinite(p) && q > 0 && p > 0 ? s + q * p : s;
  }, 0);
