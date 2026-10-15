import type { Category, Guest, Item } from "./types";

type Row = [name: string, qty: number, unitPriceTHB: number, category: Category];

/** Table A1, 13/10/2026, 12 guests. Prices include 7% VAT. */
const ROWS: Row[] = [
  ["Sweet Potatoes Fries", 1, 190, "food"],
  ["Chicken Wings", 2, 190, "food"],
  ["Grilled Calamari", 1, 290, "food"],
  ["OTBF Platter & Beer Cheese Fondue", 1, 490, "food"],
  ["Caesar Royale", 1, 320, "food"],
  ["Oktober Sausage Pizza", 2, 390, "food"],
  ["Champignon Truffle", 1, 360, "food"],
  ["Margherita Pizza", 1, 360, "food"],
  ["Seafood Arrabbiata", 1, 390, "food"],
  ["Linguine Vongole", 1, 350, "food"],
  ["Beef Lasagna", 1, 390, "food"],
  // Merged from three receipt lines: 3 + 7 + 2
  ["Still Water", 12, 30, "water"],
  ["Wild Honey Fresh Lemonade", 1, 90, "drinks"],
  ["Sunny Pop", 1, 190, "drinks"],
  ["Big Weekend", 2, 270, "alcohol"],
  ["Bitburger Pint 500 ml", 1, 189, "alcohol"],
  ["Vocation Hop, Skip & Juice (TAP)", 1, 250, "alcohol"],
  ["Katherine Hills Cabernet Sauvignon (bottle)", 3, 890, "alcohol"],
  ["Brothers Toffee Apple", 2, 290, "alcohol"],
  ["Bloody Kenny's", 1, 290, "alcohol"],
];

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const SEED_ITEMS: Item[] = ROWS.map(([name, qty, price, category]) => ({
  id: slug(name),
  name,
  category,
  qty,
  unitPriceSatang: price * 100,
}));

export const SEED_META = {
  title: "Table A1",
  date: "2026-10-13",
  guests: 12,
  receiptTotalSatang: 945900,
};

/** Who was at the party (เมษา was listed twice; treated as one person). */
const NAMES = ["กร", "กรีน", "ไนซ์", "แพรรี่", "เมษา", "ฮัท", "ฝ้าย", "สแตม", "ไบร์ท", "ไอซ์", "บอส", "นอท"];

export const SEED_ROSTER: Guest[] = NAMES.map((name, i) => ({
  id: guestId(i + 1),
  name,
}));

/** Guest ids are stable and sequential so each guest gets a distinct color. */
export function guestId(n: number) {
  return `guest-${String(n).padStart(2, "0")}`;
}
