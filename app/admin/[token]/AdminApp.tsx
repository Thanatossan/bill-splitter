"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { computeBill, formatTHB, withRoster } from "@/lib/money";
import { sendJson, usePolling } from "@/lib/client";
import { CATEGORIES, type Bill, type Category, type Person } from "@/lib/types";
import { Avatars, Card, CopyButton, Switch } from "@/components/ui";

type AdminPayload = { bill: Bill; people: Person[] };

const CAT_LABEL: Record<Category, string> = { food: "Food", drinks: "Drinks", alcohol: "Wine/Alcohol", water: "Water" };

export default function AdminApp({ token }: { token: string }) {
  const api = `/api/admin/${token}`;
  const { data, setData, status } = usePolling<AdminPayload>(api, 5000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const result = useMemo(
    () => (data ? computeBill(data.bill.items, withRoster(data.bill.roster, data.people), data.bill.extraSatang) : null),
    [data],
  );

  if (status === "notfound") return <p className="p-8 text-center text-stone-500">Admin link not found.</p>;
  if (!data || !result) return <p className="p-8 text-center text-stone-500">Loading…</p>;

  const { bill, people } = data;
  const shareUrl = `${origin}/b/${bill.id}`;

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      setData(await sendJson<AdminPayload>(api, "POST", body));
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const expected = result.itemsTotalSatang + bill.extraSatang;
  const balanced = result.sharesTotalSatang === expected;
  const receiptMatches = result.itemsTotalSatang === bill.receiptTotalSatang;
  const paidSatang = result.people.filter((p) => p.paid).reduce((s, p) => s + p.roundedSatang, 0);
  const sorted = [...result.people].sort((a, b) => a.name.localeCompare(b.name, "th"));
  const pickedIds = new Set(people.filter((p) => p.unitIds.length > 0).map((p) => p.id));
  const waiting = sorted.filter((p) => !pickedIds.has(p.id));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-5 pb-16">
      <header>
        <p className="text-sm font-medium text-emerald-700">Host view · keep this link secret</p>
        <h1 className="text-2xl font-bold">{bill.title}</h1>
        <p className="text-sm text-stone-500">
          {bill.date} · {bill.guests} guests · receipt {formatTHB(bill.receiptTotalSatang)} incl. VAT
        </p>
      </header>

      {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-800">{err}</p>}

      <Card>
        <p className="mb-1 text-sm font-semibold">Share this link with friends</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-stone-100 px-3 py-2.5 text-sm">{shareUrl}</code>
          <CopyButton text={shareUrl} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-4 py-3">
          <div>
            <p className="font-semibold">{bill.locked ? "🔒 Bill locked" : "🔓 Friends can edit"}</p>
            <p className="text-xs text-stone-500">Lock once everyone has picked, so totals stop changing.</p>
          </div>
          <Switch checked={bill.locked} disabled={busy} label="Lock bill" onChange={(v) => act({ action: "settings", locked: v })} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center justify-between text-lg font-bold">
          Live check
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              result.unclaimedSatang === 0 && balanced ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {result.unclaimedSatang === 0 && balanced ? "✓ Fully covered" : `Short ${formatTHB(expected - result.sharesTotalSatang)}`}
          </span>
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <Stat label="Receipt total" value={formatTHB(bill.receiptTotalSatang)} />
          <Stat
            label="Items on bill"
            value={formatTHB(result.itemsTotalSatang)}
            warn={!receiptMatches}
            hint={!receiptMatches ? `${formatTHB(result.itemsTotalSatang - bill.receiptTotalSatang)} vs receipt (manual items)` : undefined}
          />
          <Stat label={`${bill.extraLabel} / extra`} value={formatTHB(bill.extraSatang, { decimals: true })} />
          <Stat label="Claimed items" value={formatTHB(result.claimedSatang)} />
          <Stat label="Unclaimed" value={formatTHB(result.unclaimedSatang)} warn={result.unclaimedSatang > 0} />
          <Stat label="Sum of shares (exact)" value={formatTHB(result.sharesTotalSatang, { decimals: true })} />
          <Stat label="To collect (rounded up)" value={formatTHB(result.roundedTotalSatang)} />
          <Stat label="Rounding surplus (yours)" value={formatTHB(result.surplusSatang, { decimals: true })} />
          <Stat label="Paid so far" value={`${formatTHB(paidSatang)} / ${formatTHB(result.roundedTotalSatang)}`} />
        </dl>
        <p className="mt-3 text-xs text-stone-500">
          Check: shares {formatTHB(result.sharesTotalSatang, { decimals: true })} + unclaimed{" "}
          {formatTHB(result.unclaimedSatang)} = {formatTHB(result.sharesTotalSatang + result.unclaimedSatang, { decimals: true })}{" "}
          vs. items + extra {formatTHB(expected, { decimals: true })}{" "}
          {result.sharesTotalSatang + result.unclaimedSatang === expected ? "✓" : "✗"}
        </p>
      </Card>

      {result.unclaimed.length > 0 && (
        <Card className="ring-amber-300">
          <h2 className="mb-2 text-lg font-bold text-amber-900">
            ⚠️ Nobody has claimed {result.unclaimed.length} unit{result.unclaimed.length > 1 ? "s" : ""} (
            {formatTHB(result.unclaimedSatang)})
          </h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {result.unclaimed.map((u) => (
              <li key={u.id} className="flex justify-between gap-3 rounded-lg bg-amber-50 px-3 py-1.5">
                <span>{u.label}</span>
                <span className="tabular-nums">{formatTHB(u.priceSatang)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <h2 className="px-4 pt-4 pb-1 text-lg font-bold">
          People · {sorted.length - waiting.length} of {sorted.length} picked
        </h2>
        {waiting.length > 0 && (
          <p className="px-4 pb-2 text-sm text-amber-800">
            Waiting on: {waiting.map((p) => p.name).join(", ")}
          </p>
        )}
        {sorted.length === 0 && <p className="px-4 pb-4 text-sm text-stone-500">Nobody has saved yet.</p>}
        <ul className="divide-y divide-stone-100">
          {sorted.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatars people={[p]} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {p.name}
                    {!pickedIds.has(p.id) && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                        hasn&apos;t picked
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-stone-500 tabular-nums">
                    exact {formatTHB(p.totalSatang, { decimals: true })}
                    {p.extraSatang > 0 && ` (incl. ${formatTHB(p.extraSatang, { decimals: true })} ${bill.extraLabel.toLowerCase()})`}
                  </p>
                </div>
                <span className="text-lg font-bold tabular-nums">{formatTHB(p.roundedSatang)}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ action: "paid", personId: p.id, paid: !p.paid })}
                  className={`h-10 w-24 shrink-0 rounded-full text-sm font-semibold ${
                    p.paid ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-700"
                  }`}
                >
                  {p.paid ? "✓ Paid" : "Unpaid"}
                </button>
              </div>
              <details className="mt-1 ml-11 text-sm">
                <summary className="cursor-pointer py-1 text-stone-500">
                  {p.lines.length} item{p.lines.length === 1 ? "" : "s"}
                </summary>
                <ul className="space-y-0.5 py-1">
                  {p.lines.map((l) => (
                    <li key={l.unitId} className="flex justify-between gap-2">
                      <span className="text-stone-700">
                        {l.label}
                        {l.sharedWith > 1 && <span className="text-stone-400"> ÷{l.sharedWith}</span>}
                      </span>
                      <span className="tabular-nums">{formatTHB(l.shareSatang, { decimals: true })}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => confirm(`Remove ${p.name} from the bill?`) && act({ action: "removePerson", personId: p.id })}
                  className="mt-1 text-xs text-rose-600 underline"
                >
                  Remove person
                </button>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <GuestList bill={bill} busy={busy} act={act} />
      <PaymentForm bill={bill} busy={busy} onSave={(payment) => act({ action: "settings", payment })} />
      <ExtraForm bill={bill} busy={busy} onSave={(extraBaht, extraLabel) => act({ action: "settings", extraBaht, extraLabel })} />

      <Card>
        <h2 className="mb-2 text-lg font-bold">Items</h2>
        <ul className="divide-y divide-stone-100 text-sm">
          {bill.items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {it.name} {it.manual && <span className="text-xs text-violet-600">(manual)</span>}
                </p>
                <p className="text-xs text-stone-500 tabular-nums">
                  {CAT_LABEL[it.category]} · {it.qty} × {formatTHB(it.unitPriceSatang)} = {formatTHB(it.qty * it.unitPriceSatang)}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-stone-600">
                Everyone
                <Switch
                  checked={!!it.sharedByAll}
                  disabled={busy}
                  label={`Share ${it.name} by everyone`}
                  onChange={(v) => act({ action: "itemShared", itemId: it.id, sharedByAll: v })}
                />
              </label>
              {it.manual && (
                <button
                  type="button"
                  onClick={() => confirm(`Remove ${it.name}?`) && act({ action: "removeItem", itemId: it.id })}
                  className="h-9 rounded-lg px-2 text-rose-600"
                  aria-label={`Remove ${it.name}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        <AddItemForm busy={busy} onAdd={(item) => act({ action: "addItem", ...item })} />
      </Card>
    </main>
  );
}

function Stat({ label, value, warn, hint }: { label: string; value: string; warn?: boolean; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className={`font-semibold tabular-nums ${warn ? "text-amber-700" : ""}`}>{value}</dd>
      {hint && <dd className="text-xs text-amber-700">{hint}</dd>}
    </div>
  );
}

const input =
  "h-12 w-full rounded-xl border border-stone-300 px-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
const primary =
  "h-12 rounded-xl bg-emerald-600 px-5 font-semibold text-white active:bg-emerald-700 disabled:bg-stone-300";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

function PaymentForm({ bill, busy, onSave }: { bill: Bill; busy: boolean; onSave: (p: Bill["payment"]) => Promise<boolean> }) {
  const [p, setP] = useState(bill.payment);
  const [ok, setOk] = useState(false);
  const set = (k: keyof Bill["payment"]) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setOk(false);
    setP({ ...p, [k]: e.target.value });
  };
  const digits = p.promptpay.replace(/[^0-9]/g, "");
  const ppValid = !digits || [10, 13, 15].includes(digits.length);
  return (
    <Card>
      <h2 className="mb-1 text-lg font-bold">Payment details</h2>
      <p className="mb-3 text-sm text-stone-500">Shown to friends after they save. PromptPay generates a QR with their exact amount.</p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setOk(await onSave(p));
        }}
      >
        <Field label="PromptPay (phone or national ID)">
          <input className={input} inputMode="numeric" value={p.promptpay} onChange={set("promptpay")} placeholder="0812345678" />
          {!ppValid && <span className="text-xs text-rose-600">Use a 10-digit phone, 13-digit ID or 15-digit e-wallet.</span>}
        </Field>
        <Field label="Bank">
          <input className={input} value={p.bankName} onChange={set("bankName")} placeholder="KBank" />
        </Field>
        <Field label="Account number">
          <input className={input} inputMode="numeric" value={p.accountNo} onChange={set("accountNo")} placeholder="123-4-56789-0" />
        </Field>
        <Field label="Account name">
          <input className={input} value={p.accountName} onChange={set("accountName")} />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button className={primary} disabled={busy || !ppValid}>Save payment details</button>
          {ok && <span className="text-sm text-emerald-700">Saved ✓</span>}
        </div>
      </form>
    </Card>
  );
}

function ExtraForm({ bill, busy, onSave }: { bill: Bill; busy: boolean; onSave: (baht: string, label: string) => Promise<boolean> }) {
  const [amount, setAmount] = useState(bill.extraSatang ? String(bill.extraSatang / 100) : "");
  const [label, setLabel] = useState(bill.extraLabel);
  const [ok, setOk] = useState(false);
  return (
    <Card>
      <h2 className="mb-1 text-lg font-bold">Tip / extra</h2>
      <p className="mb-3 text-sm text-stone-500">Split proportionally to what each person ordered. Set 0 to remove.</p>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setOk(await onSave(amount || "0", label));
        }}
      >
        <Field label="Label">
          <input className={input} value={label} onChange={(e) => (setOk(false), setLabel(e.target.value))} />
        </Field>
        <Field label="Amount (THB)">
          <input className={input} inputMode="decimal" value={amount} onChange={(e) => (setOk(false), setAmount(e.target.value))} placeholder="0" />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <button className={primary} disabled={busy}>Save extra</button>
          {ok && <span className="text-sm text-emerald-700">Saved ✓</span>}
        </div>
      </form>
    </Card>
  );
}

function AddItemForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (item: { name: string; category: Category; qty: number; unitPriceBaht: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  return (
    <form
      className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-200 pt-4 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onAdd({ name, category, qty: Number(qty), unitPriceBaht: price })) {
          setName("");
          setQty("1");
          setPrice("");
        }
      }}
    >
      <p className="col-span-2 text-sm font-semibold sm:col-span-4">Add a manual item (not on the receipt)</p>
      <div className="col-span-2">
        <Field label="Name">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
      </div>
      <Field label="Category">
        <select className={input + " bg-white"} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CAT_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Qty">
        <input className={input} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required />
      </Field>
      <Field label="Unit price (THB, incl. VAT)">
        <input className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
      </Field>
      <div className="col-span-2 flex items-end sm:col-span-3">
        <button className={primary} disabled={busy || !name.trim() || !price}>Add item</button>
      </div>
    </form>
  );
}

function GuestList({
  bill,
  busy,
  act,
}: {
  bill: Bill;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const roster = bill.roster ?? [];
  return (
    <Card>
      <h2 className="mb-1 text-lg font-bold">Guest list ({roster.length})</h2>
      <p className="mb-3 text-sm text-stone-500">
        Friends tap their name instead of typing it. Items shared by everyone are split across this list.
        {roster.length !== bill.guests && ` The receipt says ${bill.guests} guests.`}
      </p>
      <ul className="flex flex-wrap gap-2">
        {roster.map((g) => (
          <li key={g.id} className="flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pr-1 pl-1">
            <Avatars people={[g]} />
            <span className="font-medium">{g.name}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm(`Remove ${g.name} from the guest list?`) && act({ action: "removeGuest", guestId: g.id })}
              className="h-7 w-7 rounded-full text-stone-500 active:bg-stone-200"
              aria-label={`Remove ${g.name}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "addGuest", name })) setName("");
        }}
      >
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a name" />
        <button className={primary} disabled={busy || !name.trim()}>
          Add
        </button>
      </form>
    </Card>
  );
}
