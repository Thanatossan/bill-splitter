"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { chargesOn, formatTHB } from "@/lib/money";
import { draftTotalSatang, toPayload, type DraftItem } from "@/lib/receipt";
import { sendJson } from "@/lib/client";
import { getProfile, rememberBill, rememberFriends, saveProfile } from "@/lib/host-storage";
import { themeStyle } from "@/lib/theme";
import type { PaymentInfo, ThemeColor } from "@/lib/types";
import { Card } from "@/components/ui";
import ItemsEditor, { type ScanResult } from "@/components/host/ItemsEditor";
import {
  ChargesFields,
  Field,
  GuestsEditor,
  PaymentFields,
  ThemePicker,
  inputCls,
  primaryCls,
  promptpayValid,
  type ChargesValue,
} from "@/components/host/form";

type HostConfig = { passcodeRequired: boolean; aiEnabled: boolean };

export default function NewBillApp() {
  const [config, setConfig] = useState<HostConfig | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/host", { cache: "no-store" })
      .then((r) => r.json())
      .then((c) => !off && setConfig(c))
      .catch(() => !off && setConfig({ passcodeRequired: true, aiEnabled: false }));
    return () => {
      off = true;
    };
  }, []);
  if (!config) return <p className="p-8 text-center text-stone-500">Loading…</p>;
  return <NewBillForm config={config} />;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function NewBillForm({ config }: { config: HostConfig }) {
  const router = useRouter();
  // Mounted only in the browser (after the config fetch), so reading the
  // host's saved details here can't cause a hydration mismatch.
  const [profile] = useState(getProfile);
  const [passcode, setPasscode] = useState(profile.passcode ?? "");
  const [rememberPass, setRememberPass] = useState(Boolean(profile.passcode));
  const [unlocked, setUnlocked] = useState(!config.passcodeRequired);
  const [checking, setChecking] = useState(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [theme, setTheme] = useState<{ emoji: string; color: ThemeColor }>({ emoji: "🎉", color: "emerald" });
  const [guests, setGuests] = useState<string[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [charges, setCharges] = useState<ChargesValue>({ serviceChargePct: "0", vatAdded: false });
  const [receiptTotal, setReceiptTotal] = useState("");
  const [payment, setPayment] = useState<PaymentInfo>(profile.payment);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function unlock() {
    setChecking(true);
    setErr("");
    try {
      await sendJson("/api/host", "POST", { passcode });
      saveProfile({ passcode: rememberPass ? passcode : undefined });
      setUnlocked(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Wrong passcode");
    } finally {
      setChecking(false);
    }
  }

  function onScanned(scan: ScanResult) {
    setCharges({ serviceChargePct: String(scan.service_charge_percent || 0), vatAdded: !scan.prices_include_vat });
    if (scan.receipt_total) setReceiptTotal(String(scan.receipt_total));
    if (!title.trim() && scan.restaurant_name) setTitle(scan.restaurant_name);
  }

  const itemsSatang = draftTotalSatang(items);
  const pct = Number(charges.serviceChargePct) || 0;
  const { service, vat } = chargesOn(itemsSatang, Math.round(pct * 100), charges.vatAdded ? 700 : 0);
  const billTotal = itemsSatang + service + vat;
  const receiptSatang = Math.round(Number(receiptTotal.replace(/,/g, "")) * 100) || 0;
  const diff = receiptSatang ? billTotal - receiptSatang : 0;
  const payload = toPayload(items);
  const canCreate = title.trim() && payload.length > 0 && guests.length > 0 && promptpayValid(payment) && !saving;

  async function create() {
    setSaving(true);
    setErr("");
    try {
      const res = await sendJson<{ id: string; adminToken: string }>("/api/bills", "POST", {
        passcode,
        title,
        date,
        emoji: theme.emoji,
        color: theme.color,
        guests,
        items: payload,
        serviceChargePct: charges.serviceChargePct || "0",
        vatAdded: charges.vatAdded,
        receiptTotalBaht: receiptTotal.replace(/,/g, ""),
        payment,
      });
      rememberBill({ id: res.id, adminToken: res.adminToken, title, emoji: theme.emoji, date });
      rememberFriends(guests);
      saveProfile({ payment });
      router.push(`/admin/${res.adminToken}?new=1`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create the bill");
      setSaving(false);
    }
  }

  if (!unlocked) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 pt-10">
        <Link href="/" className="text-sm text-stone-500">
          ← Home
        </Link>
        <Card className="mt-3">
          <h1 className="text-xl font-bold">Host passcode</h1>
          <p className="mt-1 mb-3 text-sm text-stone-500">Only you can create bills on this site.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              unlock();
            }}
          >
            <input
              type="password"
              autoComplete="current-password"
              className={inputCls}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              aria-label="Passcode"
              autoFocus
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" className="h-5 w-5" checked={rememberPass} onChange={(e) => setRememberPass(e.target.checked)} />
              Remember on this device
            </label>
            {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
            <button className={primaryCls + " mt-4 w-full"} disabled={!passcode || checking}>
              {checking ? "Checking…" : "Continue"}
            </button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-4 px-4 pt-5 pb-40" style={themeStyle(theme.color)}>
      <header>
        <Link href="/" className="text-sm text-stone-500">
          ← Home
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {theme.emoji} New bill
        </h1>
      </header>

      <Card>
        <h2 className="mb-3 text-lg font-bold">1. Party</h2>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Name">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday at Oktober" maxLength={60} />
          </Field>
          <Field label="Date">
            <input type="date" className={inputCls + " !w-40"} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <ThemePicker emoji={theme.emoji} color={theme.color} onChange={setTheme} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-bold">2. Who came ({guests.length})</h2>
        <p className="mb-3 text-sm text-stone-500">Friends tap their name instead of typing it.</p>
        <GuestsEditor names={guests} onChange={setGuests} suggestions={profile.friends} />
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-bold">3. Receipt</h2>
        <p className="mb-3 text-sm text-stone-500">
          {config.aiEnabled ? "Scan a photo or paste the items, then check them." : "Paste the items or add them one by one."}
        </p>
        <ItemsEditor items={items} onChange={setItems} passcode={passcode} aiEnabled={config.aiEnabled} onScanned={onScanned} />
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">4. Service charge &amp; VAT</h2>
        <ChargesFields value={charges} onChange={setCharges} />
        <dl className="mt-4 space-y-1 text-sm">
          <Row label="Items" value={formatTHB(itemsSatang)} />
          {service > 0 && <Row label={`Service charge ${pct}%`} value={formatTHB(service)} />}
          {vat > 0 && <Row label="VAT 7%" value={formatTHB(vat)} />}
          <Row label="Bill total" value={formatTHB(billTotal)} strong />
        </dl>
        <div className="mt-3">
          <Field
            label="Total printed on the receipt (optional)"
            hint={
              receiptSatang ? (
                diff === 0 ? (
                  <span className="text-accent-ink">✓ Matches the receipt</span>
                ) : (
                  <span className="text-amber-700">
                    {formatTHB(Math.abs(diff))} {diff > 0 ? "more" : "less"} than the receipt. Check items and charges.
                  </span>
                )
              ) : (
                "Used to double-check the items add up."
              )
            }
          >
            <input className={inputCls} inputMode="decimal" value={receiptTotal} onChange={(e) => setReceiptTotal(e.target.value)} placeholder="9,459" />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-bold">5. How friends pay you</h2>
        <p className="mb-3 text-sm text-stone-500">Saved on this phone for next time.</p>
        <PaymentFields value={payment} onChange={setPayment} />
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-3">
          {err && <p className="mb-2 text-sm text-rose-600">{err}</p>}
          <button type="button" className={primaryCls + " h-14 w-full text-lg"} disabled={!canCreate} onClick={create}>
            {saving ? "Creating…" : `Create bill · ${formatTHB(billTotal)}`}
          </button>
          {!canCreate && !saving && (
            <p className="mt-1 text-center text-xs text-stone-500">
              {!title.trim() ? "Name the party" : guests.length === 0 ? "Add the guests" : payload.length === 0 ? "Add receipt items" : "Check the PromptPay number"}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-stone-200 pt-1 font-semibold" : ""}`}>
      <dt className="text-stone-600">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
