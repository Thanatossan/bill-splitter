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

export interface Bill {
  id: string;
  adminToken: string;
  title: string;
  date: string;
  guests: number;
  /** Guest list friends pick their name from. Optional for older bills. */
  roster?: Guest[];
  /** Printed receipt total in satang (for the sanity check). */
  receiptTotalSatang: number;
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
