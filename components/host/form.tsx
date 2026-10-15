"use client";

import { useState, type ReactNode } from "react";
import { swatch } from "@/lib/theme";
import { THEME_COLORS, type PaymentInfo, type ThemeColor } from "@/lib/types";
import { Avatars } from "@/components/ui";

export const inputCls =
  "h-12 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
export const primaryCls =
  "h-12 rounded-xl bg-accent px-5 font-semibold text-white active:bg-accent-strong disabled:bg-stone-300";
export const secondaryCls =
  "h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 active:bg-stone-100 disabled:opacity-50";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const EMOJIS = ["🎉", "🍕", "🍻", "🍷", "🥂", "🍣", "🥘", "🍖", "🎂", "🌮", "🍜", "🎤"];

export function ThemePicker({
  emoji,
  color,
  onChange,
}: {
  emoji: string;
  color: ThemeColor;
  onChange: (v: { emoji: string; color: ThemeColor }) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-sm font-medium text-stone-700">Emoji</span>
        <div className="flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onChange({ emoji: e, color })}
              className={`h-11 w-11 rounded-xl text-2xl ${emoji === e ? "bg-accent-soft ring-2 ring-accent" : "bg-stone-100"}`}
              aria-label={`Emoji ${e}`}
              aria-pressed={emoji === e}
            >
              {e}
            </button>
          ))}
          <input
            className={inputCls + " !h-11 !w-16 text-center text-2xl"}
            value={EMOJIS.includes(emoji) ? "" : emoji}
            onChange={(ev) => onChange({ emoji: ev.target.value.slice(0, 8), color })}
            placeholder="…"
            aria-label="Custom emoji"
          />
        </div>
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium text-stone-700">Color</span>
        <div className="flex flex-wrap gap-2">
          {THEME_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ emoji, color: c })}
              style={{ background: swatch(c) }}
              className={`h-10 w-10 rounded-full ring-offset-2 ${color === c ? "ring-2 ring-stone-900" : ""}`}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GuestsEditor({
  names,
  onChange,
  suggestions = [],
}: {
  names: string[];
  onChange: (names: string[]) => void;
  suggestions?: string[];
}) {
  const [text, setText] = useState("");
  const has = (n: string) => names.some((x) => x.toLowerCase() === n.toLowerCase());
  const add = (raw: string) => {
    // "กร กรีน ไนซ์" splits on spaces; use commas when a name has a space in it.
    const parts = /[,\n]/.test(raw) ? raw.split(/[,\n]+/) : raw.split(/\s+/);
    const next = [...names];
    for (const p of parts.map((s) => s.trim().slice(0, 40)))
      if (p && !next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
  };
  const unused = suggestions.filter((s) => !has(s));
  return (
    <div>
      {names.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {names.map((n, i) => (
            <li key={n} className="flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pr-1 pl-1">
              <Avatars people={[{ id: `guest-${String(i + 1).padStart(2, "0")}`, name: n }]} />
              <span className="font-medium">{n}</span>
              <button
                type="button"
                onClick={() => onChange(names.filter((x) => x !== n))}
                className="h-7 w-7 rounded-full text-stone-500 active:bg-stone-200"
                aria-label={`Remove ${n}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
              setText("");
            }
          }}
          placeholder="กร กรีน ไนซ์ … (commas if a name has a space)"
          aria-label="Add guest names"
        />
        <button
          type="button"
          className={secondaryCls + " !h-12 shrink-0"}
          disabled={!text.trim()}
          onClick={() => {
            add(text);
            setText("");
          }}
        >
          Add
        </button>
      </div>
      {unused.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-stone-500">Your friends from past parties: tap to add</p>
          <div className="flex flex-wrap gap-1.5">
            {unused.slice(0, 30).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange([...names, n])}
                className="h-9 rounded-full border border-dashed border-stone-300 px-3 text-sm text-stone-700 active:bg-stone-100"
              >
                + {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ChargesValue {
  serviceChargePct: string;
  vatAdded: boolean;
}

export function ChargesFields({ value, onChange }: { value: ChargesValue; onChange: (v: ChargesValue) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {["0", "10"].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ ...value, serviceChargePct: p })}
            className={`h-11 rounded-xl px-4 text-sm font-semibold ${
              (value.serviceChargePct || "0") === p ? "bg-accent text-white" : "bg-stone-100 text-stone-700"
            }`}
          >
            {p === "0" ? "No service charge" : "Service charge 10%"}
          </button>
        ))}
        <label className="flex h-11 items-center gap-1 rounded-xl bg-stone-100 px-3 text-sm text-stone-700">
          Other
          <input
            className="w-12 rounded-md border border-stone-300 bg-white px-1.5 py-1 text-right"
            inputMode="decimal"
            value={value.serviceChargePct}
            onChange={(e) => onChange({ ...value, serviceChargePct: e.target.value })}
            aria-label="Service charge percent"
          />
          %
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          [false, "Prices include VAT", "Most menus in Thailand"],
          [true, "Add 7% VAT on top", "Receipt adds a VAT line"],
        ].map(([added, title, sub]) => (
          <button
            key={String(added)}
            type="button"
            onClick={() => onChange({ ...value, vatAdded: added as boolean })}
            className={`rounded-xl border-2 p-3 text-left ${
              value.vatAdded === added ? "border-accent bg-accent-soft" : "border-stone-200 bg-white"
            }`}
          >
            <span className="block text-sm font-semibold">{title as string}</span>
            <span className="block text-xs text-stone-500">{sub as string}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PaymentFields({ value, onChange }: { value: PaymentInfo; onChange: (v: PaymentInfo) => void }) {
  const set = (k: keyof PaymentInfo) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const digits = value.promptpay.replace(/[^0-9]/g, "");
  const ppValid = !digits || [10, 13, 15].includes(digits.length);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label="PromptPay (phone or national ID)"
        hint={!ppValid ? <span className="text-rose-600">Use a 10-digit phone, 13-digit ID or 15-digit e-wallet.</span> : undefined}
      >
        <input className={inputCls} inputMode="numeric" value={value.promptpay} onChange={set("promptpay")} placeholder="0812345678" />
      </Field>
      <Field label="Bank">
        <input className={inputCls} value={value.bankName} onChange={set("bankName")} placeholder="KBank" />
      </Field>
      <Field label="Account number">
        <input className={inputCls} inputMode="numeric" value={value.accountNo} onChange={set("accountNo")} />
      </Field>
      <Field label="Account name">
        <input className={inputCls} value={value.accountName} onChange={set("accountName")} />
      </Field>
    </div>
  );
}

export const promptpayValid = (p: PaymentInfo) => {
  const d = p.promptpay.replace(/[^0-9]/g, "");
  return !d || [10, 13, 15].includes(d.length);
};
