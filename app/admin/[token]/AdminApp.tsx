"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { billCharges, computeBill, formatTHB, withRoster } from "@/lib/money";
import { sendJson, usePolling } from "@/lib/client";
import { rememberBill, rememberFriends, saveProfile } from "@/lib/host-storage";
import { SMS_SEGMENT_COST_SATANG, friendUrl, notifyText, pickRecipients, smsSegments } from "@/lib/notify";
import { toDraft, toPayload, type DraftItem } from "@/lib/receipt";
import { themeStyle } from "@/lib/theme";
import type { Bill, Category, Contact, NotifyLog, PaymentInfo, Person, ThemeColor } from "@/lib/types";
import { Avatars, Card, CopyButton, Switch } from "@/components/ui";
import ItemsEditor from "@/components/host/ItemsEditor";
import { NotifyButtons, SmsStatus, TextEveryone } from "@/components/host/notify";
import {
  ChargesFields,
  Field,
  PaymentFields,
  ThemePicker,
  inputCls,
  primaryCls,
  promptpayValid,
  secondaryCls,
  type ChargesValue,
} from "@/components/host/form";

type AdminPayload = {
  bill: Bill;
  people: Person[];
  aiEnabled: boolean;
  contacts: Record<string, Contact>;
  notified: Record<string, NotifyLog>;
  smsEnabled: boolean;
  /** Base URL used in automatic SMS, or null when they're sent without a link. */
  smsLinkBase: string | null;
  smsHostName?: string;
};
/** Runs an admin action; resolves to the new payload, or null on failure. */
type Act = (body: Record<string, unknown>) => Promise<AdminPayload | null>;

const CAT_LABEL: Record<Category, string> = { food: "Food", drinks: "Drinks", alcohol: "Wine/Alcohol", water: "Water" };
const noSubscribe = () => () => {};

export default function AdminApp({ token }: { token: string }) {
  const api = `/api/admin/${token}`;
  const { data, setData, status } = usePolling<AdminPayload>(api, 5000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const justCreated = useSyncExternalStore(noSubscribe, () => window.location.search.includes("new=1"), () => false);

  const result = useMemo(
    () => (data ? computeBill(data.bill.items, withRoster(data.bill.roster, data.people), billCharges(data.bill)) : null),
    [data],
  );

  // Keep this bill in "My bills" on this phone (also picks up bills made elsewhere).
  const bill = data?.bill;
  useEffect(() => {
    if (bill) rememberBill({ id: bill.id, adminToken: token, title: bill.title, emoji: bill.emoji, date: bill.date });
  }, [bill, token]);

  if (status === "notfound") return <p className="p-8 text-center text-stone-500">Admin link not found.</p>;
  if (!data || !result || !bill) return <p className="p-8 text-center text-stone-500">Loading…</p>;

  const { people, contacts, notified } = data;
  const shareUrl = `${origin}/b/${bill.id}`;
  const shareText = `${bill.emoji ?? "🧾"} ${bill.title}: tick what you had and see what you owe 👉 ${shareUrl}`;

  const act: Act = async (body) => {
    setBusy(true);
    setErr("");
    try {
      const next = await sendJson<AdminPayload>(api, "POST", body);
      setData(next);
      return next;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const covered = result.unclaimedSatang === 0 && result.sharesTotalSatang === result.grandTotalSatang;
  const restaurantTotal = result.itemsTotalSatang + result.serviceSatang + result.vatSatang;
  const receiptDiff = bill.receiptTotalSatang ? restaurantTotal - bill.receiptTotalSatang : 0;
  const paidSatang = result.people.filter((p) => p.paid).reduce((s, p) => s + p.roundedSatang, 0);
  const sorted = [...result.people].sort((a, b) => a.name.localeCompare(b.name, "th"));
  const pickedIds = new Set(people.filter((p) => p.unitIds.length > 0).map((p) => p.id));
  const waiting = sorted.filter((p) => !pickedIds.has(p.id));
  const servicePct = (bill.serviceBp ?? 0) / 100;

  // The same message the automatic SMS sends, with each friend's own link.
  const messageFor = (p: { id: string; name: string; roundedSatang: number }, base: string | null = origin) =>
    notifyText({
      title: bill.title,
      name: p.name,
      amountSatang: p.roundedSatang,
      url: base && friendUrl(base, bill.id, p.id),
      host: data.smsHostName,
    });
  const owed = Object.fromEntries(result.people.map((p) => [p.id, p.paid ? 0 : p.roundedSatang]));
  const smsQueue = data.smsEnabled ? pickRecipients(result.people, contacts, notified, { owed }) : [];
  const smsSegmentCounts = smsQueue.map((r) => smsSegments(messageFor(result.byId[r.id], data.smsLinkBase)).segments);
  const withContact = sorted.filter((p) => contacts[p.id]).length;
  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3000);
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-5 pb-16" style={themeStyle(bill.color)}>
      <header>
        <Link href="/" className="text-sm text-stone-500">
          ← My bills
        </Link>
        <p className="mt-1 text-sm font-medium text-accent-ink">Host view · keep this link secret</p>
        <h1 className="text-2xl font-bold">
          {bill.emoji} {bill.title}
        </h1>
        <p className="text-sm text-stone-500">
          {bill.date} · {bill.roster?.length || bill.guests} guests · {formatTHB(result.grandTotalSatang)}
        </p>
      </header>

      {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-800">{err}</p>}
      {justCreated && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent-ink">
          🎉 Bill created. Send the link below to the group. This admin page is saved under “My bills” on this phone.
        </p>
      )}

      <Card>
        <p className="mb-1 text-sm font-semibold">Share this link with friends</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-stone-100 px-3 py-2.5 text-sm">{shareUrl}</code>
          <CopyButton text={shareUrl} />
        </div>
        <a
          href={`https://line.me/R/share?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex h-12 items-center justify-center rounded-xl bg-[#06C755] font-semibold text-white active:opacity-90"
        >
          Send in LINE
        </a>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-4 py-3">
          <div>
            <p className="font-semibold">{bill.locked ? "🔒 Bill locked" : "🔓 Friends can edit"}</p>
            <p className="text-xs text-stone-500">Lock once everyone has picked, so totals stop changing.</p>
          </div>
          <Switch checked={bill.locked} disabled={busy} label="Lock bill" onChange={(v) => act({ action: "settings", locked: v })} />
        </div>
        {bill.locked && (
          <div className="mt-3 space-y-2">
            {data.smsEnabled && (
              <TextEveryone
                count={smsQueue.length}
                costSatang={smsSegmentCounts.reduce((a, b) => a + b, 0) * SMS_SEGMENT_COST_SATANG}
                maxSegments={Math.max(0, ...smsSegmentCounts)}
                linkless={!data.smsLinkBase}
                busy={busy}
                onSend={async () => Boolean(await act({ action: "notify" }))}
              />
            )}
            <p className="text-xs text-stone-500">
              {withContact > 0
                ? "Text each friend their final amount with the buttons under their name."
                : "Nobody has left their number yet. Friends can add it on their page after they pick."}
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center justify-between text-lg font-bold">
          Live check
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              covered ? "bg-accent-soft text-accent-ink" : "bg-amber-100 text-amber-800"
            }`}
          >
            {covered ? "✓ Fully covered" : `Short ${formatTHB(result.grandTotalSatang - result.sharesTotalSatang)}`}
          </span>
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <Stat label="Items" value={formatTHB(result.itemsTotalSatang)} />
          {result.serviceSatang > 0 && <Stat label={`Service ${servicePct}%`} value={formatTHB(result.serviceSatang)} />}
          {result.vatSatang > 0 && <Stat label="VAT 7%" value={formatTHB(result.vatSatang)} />}
          {bill.extraSatang > 0 && <Stat label={bill.extraLabel} value={formatTHB(bill.extraSatang)} />}
          <Stat label="Bill total" value={formatTHB(result.grandTotalSatang)} />
          <Stat
            label="Receipt says"
            value={bill.receiptTotalSatang ? formatTHB(bill.receiptTotalSatang) : "—"}
            warn={receiptDiff !== 0}
            hint={receiptDiff !== 0 ? `${formatTHB(Math.abs(receiptDiff))} ${receiptDiff > 0 ? "over" : "under"} the receipt` : undefined}
          />
          <Stat label="Unclaimed items" value={formatTHB(result.unclaimedSatang)} warn={result.unclaimedSatang > 0} />
          <Stat label="Sum of shares (exact)" value={formatTHB(result.sharesTotalSatang, { decimals: true })} />
          <Stat label="To collect (rounded up)" value={formatTHB(result.roundedTotalSatang)} />
          <Stat label="Rounding surplus (yours)" value={formatTHB(result.surplusSatang, { decimals: true })} />
          <Stat label="Paid so far" value={`${formatTHB(paidSatang)} / ${formatTHB(result.roundedTotalSatang)}`} />
        </dl>
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
          <p className="px-4 pb-2 text-sm text-amber-800">Waiting on: {waiting.map((p) => p.name).join(", ")}</p>
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
                    {contacts[p.id] && <span className="ml-1 text-xs" aria-label="Left their number">📱</span>}
                    {!pickedIds.has(p.id) && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                        hasn&apos;t picked
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-stone-500 tabular-nums">exact {formatTHB(p.totalSatang, { decimals: true })}</p>
                </div>
                <span className="text-lg font-bold tabular-nums">{formatTHB(p.roundedSatang)}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ action: "paid", personId: p.id, paid: !p.paid })}
                  className={`h-10 w-24 shrink-0 rounded-full text-sm font-semibold ${
                    p.paid ? "bg-accent text-white" : "bg-stone-200 text-stone-700"
                  }`}
                >
                  {p.paid ? "✓ Paid" : "Unpaid"}
                </button>
              </div>
              {bill.locked && !p.paid && contacts[p.id] && (
                <div className="mt-2 ml-11 space-y-1">
                  <NotifyButtons contact={contacts[p.id]} text={messageFor(p)} onNotice={flash} />
                  {data.smsEnabled && (
                    <SmsStatus log={notified[p.id]} busy={busy} onResend={() => act({ action: "notify", guestIds: [p.id] })} />
                  )}
                </div>
              )}
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
                  {p.serviceSatang > 0 && <ChargeLine label={`Service ${servicePct}%`} value={p.serviceSatang} />}
                  {p.vatSatang > 0 && <ChargeLine label="VAT 7%" value={p.vatSatang} />}
                  {p.extraSatang > 0 && <ChargeLine label={bill.extraLabel} value={p.extraSatang} />}
                </ul>
                <button
                  type="button"
                  onClick={() => confirm(`Remove ${p.name}'s picks from the bill?`) && act({ action: "removePerson", personId: p.id })}
                  className="mt-1 text-xs text-rose-600 underline"
                >
                  Clear their picks
                </button>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <ItemsCard bill={bill} token={token} aiEnabled={data.aiEnabled} busy={busy} act={act} />
      <SettingsCard bill={bill} busy={busy} act={act} />
      <GuestList bill={bill} contacts={contacts} busy={busy} act={act} />
      <PaymentCard bill={bill} busy={busy} act={act} />
      {notice && (
        <p
          role="status"
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-sm rounded-xl bg-stone-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg"
        >
          {notice}
        </p>
      )}
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

function ChargeLine({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between gap-2 text-stone-500">
      <span>{label}</span>
      <span className="tabular-nums">{formatTHB(value, { decimals: true })}</span>
    </li>
  );
}

/** Card header with an Edit / Cancel toggle. Editing state is local so polling can't clobber a form. */
function EditableCard({
  title,
  editing,
  setEditing,
  children,
}: {
  title: string;
  editing: boolean;
  setEditing: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="mb-3 flex items-center justify-between text-lg font-bold">
        {title}
        <button type="button" className={secondaryCls + " !h-9"} onClick={() => setEditing(!editing)}>
          {editing ? "Cancel" : "Edit"}
        </button>
      </h2>
      {children}
    </Card>
  );
}

function ItemsCard({ bill, token, aiEnabled, busy, act }: { bill: Bill; token: string; aiEnabled: boolean; busy: boolean; act: Act }) {
  const [draft, setDraft] = useState<DraftItem[] | null>(null);
  const editing = draft !== null;
  return (
    <EditableCard title={`Receipt items (${bill.items.length})`} editing={editing} setEditing={(v) => setDraft(v ? bill.items.map(toDraft) : null)}>
      {editing ? (
        <>
          <ItemsEditor items={draft} onChange={setDraft} adminToken={token} aiEnabled={aiEnabled} />
          <p className="mt-3 text-xs text-stone-500">
            Friends keep their ticks on items you rename or reprice. Ticks on removed items are dropped.
          </p>
          <button
            type="button"
            className={primaryCls + " mt-3 w-full"}
            disabled={busy || toPayload(draft).length === 0}
            onClick={async () => (await act({ action: "replaceItems", items: toPayload(draft) })) && setDraft(null)}
          >
            Save items
          </button>
        </>
      ) : (
        <ul className="divide-y divide-stone-100 text-sm">
          {bill.items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{it.name}</p>
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
            </li>
          ))}
        </ul>
      )}
    </EditableCard>
  );
}

function SettingsCard({ bill, busy, act }: { bill: Bill; busy: boolean; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(bill.title);
  const [date, setDate] = useState(bill.date);
  const [theme, setTheme] = useState<{ emoji: string; color: ThemeColor }>({ emoji: bill.emoji ?? "🧾", color: bill.color ?? "emerald" });
  const [charges, setCharges] = useState<ChargesValue>({
    serviceChargePct: String((bill.serviceBp ?? 0) / 100),
    vatAdded: (bill.vatBp ?? 0) > 0,
  });
  const [receiptTotal, setReceiptTotal] = useState(bill.receiptTotalSatang ? String(bill.receiptTotalSatang / 100) : "");
  const [extra, setExtra] = useState(bill.extraSatang ? String(bill.extraSatang / 100) : "");
  const [extraLabel, setExtraLabel] = useState(bill.extraLabel);

  const open = (v: boolean) => {
    if (v) {
      // Start from the latest saved values each time the form opens.
      setTitle(bill.title);
      setDate(bill.date);
      setTheme({ emoji: bill.emoji ?? "🧾", color: bill.color ?? "emerald" });
      setCharges({ serviceChargePct: String((bill.serviceBp ?? 0) / 100), vatAdded: (bill.vatBp ?? 0) > 0 });
      setReceiptTotal(bill.receiptTotalSatang ? String(bill.receiptTotalSatang / 100) : "");
      setExtra(bill.extraSatang ? String(bill.extraSatang / 100) : "");
      setExtraLabel(bill.extraLabel);
    }
    setEditing(v);
  };

  return (
    <EditableCard title="Party, charges & tip" editing={editing} setEditing={open}>
      {editing ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act({
              action: "settings",
              title,
              date,
              emoji: theme.emoji,
              color: theme.color,
              serviceChargePct: charges.serviceChargePct || "0",
              vatAdded: charges.vatAdded,
              receiptTotalBaht: receiptTotal.replace(/,/g, ""),
              extraBaht: extra.replace(/,/g, "") || "0",
              extraLabel,
            });
            if (ok) setEditing(false);
          }}
        >
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Party name">
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls + " !w-40"} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <ThemePicker emoji={theme.emoji} color={theme.color} onChange={setTheme} />
          <ChargesFields value={charges} onChange={setCharges} />
          <Field label="Total printed on the receipt (optional)">
            <input className={inputCls} inputMode="decimal" value={receiptTotal} onChange={(e) => setReceiptTotal(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tip / extra label">
              <input className={inputCls} value={extraLabel} onChange={(e) => setExtraLabel(e.target.value)} />
            </Field>
            <Field label="Amount (THB)" hint="Split by what each person ordered">
              <input className={inputCls} inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" />
            </Field>
          </div>
          <button className={primaryCls + " w-full"} disabled={busy || !title.trim()}>
            Save
          </button>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Stat label="Party" value={`${bill.emoji ?? ""} ${bill.title}`} />
          <Stat label="Date" value={bill.date} />
          <Stat label="Service charge" value={bill.serviceBp ? `${(bill.serviceBp ?? 0) / 100}%` : "None"} />
          <Stat label="VAT" value={bill.vatBp ? "7% added on top" : "Included in prices"} />
          <Stat label={bill.extraLabel || "Tip"} value={bill.extraSatang ? formatTHB(bill.extraSatang) : "None"} />
          <Stat label="Receipt total" value={bill.receiptTotalSatang ? formatTHB(bill.receiptTotalSatang) : "—"} />
        </dl>
      )}
    </EditableCard>
  );
}

function PaymentCard({ bill, busy, act }: { bill: Bill; busy: boolean; act: Act }) {
  const [draft, setDraft] = useState<PaymentInfo | null>(null);
  const p = bill.payment;
  return (
    <EditableCard title="Payment details" editing={draft !== null} setEditing={(v) => setDraft(v ? bill.payment : null)}>
      {draft ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "settings", payment: draft })) {
              saveProfile({ payment: draft });
              setDraft(null);
            }
          }}
        >
          <PaymentFields value={draft} onChange={setDraft} />
          <button className={primaryCls + " mt-3 w-full"} disabled={busy || !promptpayValid(draft)}>
            Save payment details
          </button>
          <p className="mt-2 text-xs text-stone-500">Also saved on this phone for your next bill.</p>
        </form>
      ) : p.promptpay || p.accountNo ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Stat label="PromptPay" value={p.promptpay || "—"} />
          <Stat label="Bank" value={[p.bankName, p.accountNo].filter(Boolean).join(" ") || "—"} />
          <Stat label="Account name" value={p.accountName || "—"} />
        </dl>
      ) : (
        <p className="text-sm text-amber-800">Add your PromptPay number so friends get a QR code with their amount.</p>
      )}
    </EditableCard>
  );
}

function GuestList({
  bill,
  contacts,
  busy,
  act,
}: {
  bill: Bill;
  contacts: Record<string, Contact>;
  busy: boolean;
  act: Act;
}) {
  const [name, setName] = useState("");
  const roster = bill.roster ?? [];
  const withPhone = roster.filter((g) => contacts[g.id]).length;
  return (
    <Card>
      <h2 className="mb-1 text-lg font-bold">Guest list ({roster.length})</h2>
      <p className="mb-3 text-sm text-stone-500">
        Friends tap their name instead of typing it. Items shared by everyone are split across this list.
      </p>
      <ul className="flex flex-wrap gap-2">
        {roster.map((g) => (
          <li key={g.id} className="flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pr-1 pl-1">
            <Avatars people={[g]} />
            <span className="font-medium">{g.name}</span>
            {contacts[g.id] && (
              <span className="text-xs" title="Left their number" aria-label="Left their number">
                📱
              </span>
            )}
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
      <p className="mt-2 text-xs text-stone-500">
        📱 {withPhone} of {roster.length} left their number on their page, to get a text when the bill is final.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "addGuest", name })) {
            rememberFriends([name.trim()]);
            setName("");
          }
        }}
      >
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a name" />
        <button className={primaryCls} disabled={busy || !name.trim()}>
          Add
        </button>
      </form>
    </Card>
  );
}
