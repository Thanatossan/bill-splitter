"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { colorFor, copyText, initials } from "@/lib/client";
import { useLang } from "@/lib/i18n";

export function Avatars({
  people,
  max = 5,
  size = "sm",
}: {
  people: { id: string; name: string }[];
  max?: number;
  size?: "sm" | "md";
}) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <div className="flex -space-x-1.5" aria-label={people.map((p) => p.name).join(", ")}>
      {shown.map((p) => (
        <span
          key={p.id}
          title={p.name}
          className={`${dim} ${colorFor(p.id)} inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white`}
        >
          {initials(p.name)}
        </span>
      ))}
      {people.length > max && (
        <span
          className={`${dim} inline-flex items-center justify-center rounded-full bg-stone-300 font-semibold text-stone-700 ring-2 ring-white`}
        >
          +{people.length - max}
        </span>
      )}
    </div>
  );
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "th" : "en")}
      className="h-10 rounded-full border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 active:bg-stone-100"
      aria-label="Switch language"
    >
      {lang === "en" ? "ไทย" : "EN"}
    </button>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className="h-10 shrink-0 rounded-lg bg-stone-100 px-3 text-sm font-medium text-stone-700 active:bg-stone-200"
    >
      {done ? t("copied") : (label ?? t("copy"))}
    </button>
  );
}

export function PromptPayQR({ target, amountSatang }: { target: string; amountSatang: number }) {
  const payload = useMemo(() => {
    try {
      return generatePayload(target, { amount: amountSatang / 100 });
    } catch {
      return null;
    }
  }, [target, amountSatang]);
  const [qr, setQr] = useState<{ payload: string; svg: string | null } | null>(null);
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((svg) => !cancelled && setQr({ payload, svg }))
      .catch(() => !cancelled && setQr({ payload, svg: null }));
    return () => {
      cancelled = true;
    };
  }, [payload]);
  const svg = qr?.payload === payload ? qr.svg : undefined;
  if (!payload || svg === null) return null;
  return (
    <div className="mx-auto w-full max-w-[260px] rounded-2xl border border-stone-200 bg-white p-3">
      <div className="mb-2 rounded-lg bg-[#113566] py-1.5 text-center text-sm font-bold tracking-wide text-white">
        PromptPay
      </div>
      {svg ? (
        <div className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="aspect-square w-full animate-pulse rounded bg-stone-100" />
      )}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70 ${className}`}>{children}</section>;
}

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
        checked ? "border-emerald-600 bg-emerald-600" : "border-stone-300 bg-white"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-emerald-600" : "bg-stone-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
