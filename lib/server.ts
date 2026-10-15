import { randomBytes } from "crypto";
import { store } from "./store";
import type { Bill, BillPayload, Item } from "./types";
import { SEED_ITEMS, SEED_META, SEED_ROSTER } from "./seed-data";

export const randomId = (bytes: number) => randomBytes(bytes).toString("base64url");

export async function createBill(
  init: Partial<Bill> & { items: Item[] } = { ...SEED_META, items: SEED_ITEMS, roster: SEED_ROSTER },
): Promise<Bill> {
  const bill: Bill = {
    id: randomId(9),
    adminToken: randomId(18),
    title: "Dinner",
    date: new Date().toISOString().slice(0, 10),
    guests: 0,
    roster: [],
    receiptTotalSatang: 0,
    extraSatang: 0,
    extraLabel: "Tip",
    locked: false,
    payment: { promptpay: "", bankName: "", accountNo: "", accountName: "" },
    createdAt: Date.now(),
    ...init,
  };
  await store.putBill(bill);
  return bill;
}

export async function loadPayload(billId: string): Promise<BillPayload | null> {
  const [bill, people] = await Promise.all([store.getBill(billId), store.getPeople(billId)]);
  if (!bill) return null;
  const { adminToken: _omit, ...pub } = bill;
  void _omit;
  return { bill: pub, people };
}

export async function billForAdmin(token: string): Promise<Bill | null> {
  const id = await store.billIdForAdmin(token);
  return id ? store.getBill(id) : null;
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const error = (message: string, status: number) => json({ error: message }, status);

export async function readJson<T>(req: Request): Promise<Partial<T>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export const cleanText = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Parse a THB amount (number or string, up to 2 decimals) into satang. */
export function parseBahtToSatang(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "")) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100);
}
