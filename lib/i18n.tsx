"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { storage } from "./client";

const en = {
  appName: "Split the bill",
  guests: "guests",
  inclVat: "incl. VAT",
  yourName: "What's your name?",
  whoAreYou: "Who are you?",
  pickName: "Tap your name. We'll remember you on this phone.",
  notOnList: "Not on the list? Type your name",
  picked: "picked",
  pickedCount: "{n} of {total} have picked",
  namePlaceholder: "e.g. Ploy",
  nameHint: "No login needed. We'll remember you on this phone so you can come back and edit.",
  continue: "Continue",
  hi: "Hi, {name}",
  edit: "Edit",
  quick: "Quick actions",
  splitAll: "Split everything evenly",
  skipAlcohol: "Skip alcohol",
  clear: "Clear all",
  splitAllHint: "Ticks every item. You'll share everything with everyone else who ticks it.",
  food: "Food",
  drinks: "Drinks",
  alcohol: "Wine / Alcohol",
  water: "Water",
  sharedByAll: "Shared by everyone",
  sharedByAllHint: "Split between all {n} people on the bill. Changes it for everyone.",
  each: "each",
  yourShare: "your share",
  splitN: "÷{n}",
  unclaimedBanner: "{count} items (฿{amount}) not claimed by anyone yet",
  yourTotal: "Your total",
  exact: "exact {amount}",
  save: "Save",
  saved: "Saved",
  saving: "Saving…",
  update: "Update",
  locked: "The host has locked the bill. Selections can't be changed.",
  nothingTicked: "Tick at least one item",
  breakdown: "Your breakdown",
  subtotal: "Subtotal",
  total: "Total",
  youPay: "You pay",
  roundNote: "Rounded up to the nearest whole baht. The host keeps the few satang extra.",
  editSelection: "Edit my selection",
  paid: "Paid",
  markedPaid: "The host has marked you as paid. Thanks!",
  payment: "Payment",
  scanToPay: "Scan with any Thai banking app. The amount is filled in.",
  promptpay: "PromptPay",
  bank: "Bank",
  account: "Account",
  accountName: "Name",
  copy: "Copy",
  copied: "Copied!",
  amount: "Amount",
  noPayment: "The host hasn't added payment details yet. Check back soon.",
  notFound: "This bill link doesn't exist.",
  loading: "Loading…",
  saveFailed: "Couldn't save. Check your connection and try again.",
  vatNote: "Prices already include 7% VAT",
};

type Dict = typeof en;

const th: Dict = {
  appName: "หารค่าอาหาร",
  guests: "คน",
  inclVat: "รวม VAT",
  yourName: "คุณชื่ออะไร?",
  whoAreYou: "คุณคือใคร?",
  pickName: "แตะชื่อของคุณ ระบบจะจำไว้ในมือถือเครื่องนี้",
  notOnList: "ไม่มีชื่อในรายการ? พิมพ์ชื่อของคุณ",
  picked: "เลือกแล้ว",
  pickedCount: "เลือกแล้ว {n} จาก {total} คน",
  namePlaceholder: "เช่น พลอย",
  nameHint: "ไม่ต้องล็อกอิน ระบบจะจำคุณไว้ในมือถือเครื่องนี้ กลับมาแก้ไขได้",
  continue: "ต่อไป",
  hi: "สวัสดี {name}",
  edit: "แก้ไข",
  quick: "ทางลัด",
  splitAll: "หารทุกอย่างเท่ากัน",
  skipAlcohol: "ไม่เอาแอลกอฮอล์",
  clear: "ล้างทั้งหมด",
  splitAllHint: "ติ๊กทุกรายการ คุณจะหารกับทุกคนที่ติ๊กรายการเดียวกัน",
  food: "อาหาร",
  drinks: "เครื่องดื่ม",
  alcohol: "ไวน์ / แอลกอฮอล์",
  water: "น้ำเปล่า",
  sharedByAll: "หารทุกคน",
  sharedByAllHint: "หารเท่ากันทั้ง {n} คนในบิล (มีผลกับทุกคน)",
  each: "ต่อชิ้น",
  yourShare: "ส่วนของคุณ",
  splitN: "÷{n}",
  unclaimedBanner: "ยังมี {count} รายการ (฿{amount}) ที่ไม่มีใครเลือก",
  yourTotal: "ยอดของคุณ",
  exact: "ยอดจริง {amount}",
  save: "บันทึก",
  saved: "บันทึกแล้ว",
  saving: "กำลังบันทึก…",
  update: "อัปเดต",
  locked: "เจ้าภาพล็อกบิลแล้ว ไม่สามารถแก้ไขได้",
  nothingTicked: "เลือกอย่างน้อยหนึ่งรายการ",
  breakdown: "รายละเอียดของคุณ",
  subtotal: "รวมรายการ",
  total: "รวม",
  youPay: "ยอดที่ต้องจ่าย",
  roundNote: "ปัดขึ้นเป็นบาทเต็ม เศษสตางค์เล็กน้อยเป็นของเจ้าภาพ",
  editSelection: "แก้ไขรายการ",
  paid: "จ่ายแล้ว",
  markedPaid: "เจ้าภาพบันทึกว่าคุณจ่ายแล้ว ขอบคุณ!",
  payment: "การชำระเงิน",
  scanToPay: "สแกนด้วยแอปธนาคารใดก็ได้ ยอดเงินใส่ไว้ให้แล้ว",
  promptpay: "พร้อมเพย์",
  bank: "ธนาคาร",
  account: "เลขบัญชี",
  accountName: "ชื่อบัญชี",
  copy: "คัดลอก",
  copied: "คัดลอกแล้ว!",
  amount: "ยอดเงิน",
  noPayment: "เจ้าภาพยังไม่ได้ใส่ข้อมูลการโอน ลองกลับมาดูอีกครั้ง",
  notFound: "ไม่พบบิลนี้",
  loading: "กำลังโหลด…",
  saveFailed: "บันทึกไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
  vatNote: "ราคารวม VAT 7% แล้ว",
};

export type Lang = "en" | "th";
export type TFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: TFn } | null>(null);

// Language lives outside React so it can be read from localStorage after
// hydration without a setState-in-effect round trip.
let currentLang: Lang | null = null;
const langListeners = new Set<() => void>();
const subscribeLang = (cb: () => void) => {
  langListeners.add(cb);
  return () => langListeners.delete(cb);
};
const getLang = (): Lang => (currentLang ??= storage.get("lang") === "th" ? "th" : "en");
const setLang = (l: Lang) => {
  currentLang = l;
  storage.set("lang", l);
  langListeners.forEach((cb) => cb());
};

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => "en" as Lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const dict = lang === "th" ? th : en;
  const t: TFn = (key, vars) =>
    dict[key].replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`));
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}
