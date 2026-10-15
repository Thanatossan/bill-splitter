"use client";

import { storage } from "./client";
import type { PaymentInfo } from "./types";

/** Host-only conveniences, kept on the host's own phone. */
export interface HostProfile {
  payment: PaymentInfo;
  /** Names from past guest lists, most recent first. */
  friends: string[];
  /** Saved only if the host ticks "remember on this device". */
  passcode?: string;
}

export interface MyBill {
  id: string;
  adminToken: string;
  title: string;
  emoji?: string;
  date: string;
  savedAt: number;
}

const PROFILE = "splitbill:host";
const BILLS = "splitbill:bills";

const read = <T,>(key: string, fallback: T): T => {
  try {
    return { ...fallback, ...JSON.parse(storage.get(key) ?? "null") };
  } catch {
    return fallback;
  }
};

export const EMPTY_PAYMENT: PaymentInfo = { promptpay: "", bankName: "", accountNo: "", accountName: "" };

export function getProfile(): HostProfile {
  return read<HostProfile>(PROFILE, { payment: EMPTY_PAYMENT, friends: [] });
}

export function saveProfile(patch: Partial<HostProfile>) {
  storage.set(PROFILE, JSON.stringify({ ...getProfile(), ...patch }));
}

export function rememberFriends(names: string[]) {
  const seen = new Set<string>();
  const friends = [...names, ...getProfile().friends].filter((n) => {
    const k = n.toLowerCase();
    return n && !seen.has(k) && seen.add(k);
  });
  saveProfile({ friends: friends.slice(0, 60) });
}

export function listBills(): MyBill[] {
  try {
    const bills = JSON.parse(storage.get(BILLS) ?? "[]");
    return Array.isArray(bills) ? bills : [];
  } catch {
    return [];
  }
}

export function rememberBill(bill: Omit<MyBill, "savedAt">) {
  const others = listBills().filter((b) => b.id !== bill.id);
  const prev = listBills().find((b) => b.id === bill.id);
  storage.set(BILLS, JSON.stringify([{ ...bill, savedAt: prev?.savedAt ?? Date.now() }, ...others].slice(0, 50)));
}

export function forgetBill(id: string) {
  storage.set(BILLS, JSON.stringify(listBills().filter((b) => b.id !== id)));
}
