export type Category = "food" | "drinks" | "alcohol" | "water";

export const CATEGORIES: Category[] = ["food", "drinks", "alcohol", "water"];

/** A receipt line. Each of its `qty` units is claimable on its own. */
export interface Item {
  id: string;
  name: string;
  category: Category;
  qty: number;
  /** Price per unit in satang, VAT already included. */
  unitPriceSatang: number;
  /** When true, every unit is split among everyone on the bill, ignoring ticks. */
  sharedByAll?: boolean;
  /** Added by the host, not on the printed receipt. */
  manual?: boolean;
}

export interface PaymentInfo {
  promptpay: string;
  bankName: string;
  accountNo: string;
  accountName: string;
}

/** Someone on the guest list. Their Person record (if saved) shares this id. */
export interface Guest {
  id: string;
  name: string;
}

/**
 * How the host reaches a guest; the friend enters it on their own page.
 * Stored apart from the Bill (which anyone with the share link can read) and
 * only ever returned by the admin API.
 */
export interface Contact {
  /** E.164, e.g. +66812345678. */
  phone: string;
}

/** Result of the last automatic SMS to a guest. */
export interface NotifyLog {
  at: number;
  status: "sent" | "failed";
  error?: string;
}

export const THEME_COLORS = ["emerald", "teal", "sky", "indigo", "violet", "pink", "rose", "orange"] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

export interface Bill {
  id: string;
  adminToken: string;
  title: string;
  date: string;
  guests: number;
  /** Guest list friends pick their name from. Optional for older bills. */
  roster?: Guest[];
  /** Printed receipt total in satang (for the sanity check; 0 = unknown). */
  receiptTotalSatang: number;
  emoji?: string;
  color?: ThemeColor;
  /** Service charge in basis points (1000 = 10%), on top of item prices. */
  serviceBp?: number;
  /** VAT added on top in basis points (700 = 7%); 0 when prices include VAT. */
  vatBp?: number;
  items: Item[];
  /** Tip / service / extra, split proportionally to each person's subtotal. */
  extraSatang: number;
  extraLabel: string;
  locked: boolean;
  payment: PaymentInfo;
  createdAt: number;
}

export interface Person {
  id: string;
  name: string;
  unitIds: string[];
  paid: boolean;
  updatedAt: number;
}

/** Bill as sent to friends: no admin token. */
export type PublicBill = Omit<Bill, "adminToken">;

export interface BillPayload {
  bill: PublicBill;
  people: Person[];
}
