"use client";

import { useMemo, useState } from "react";
import { billCharges, computeBill, expandUnits, formatTHB, withRoster, type BillResult, type UnitResult } from "@/lib/money";
import { newId, sendJson, storage, usePolling } from "@/lib/client";
import { useLang, type TFn } from "@/lib/i18n";
import { themeStyle } from "@/lib/theme";
import { CATEGORIES, type BillPayload, type Category, type Guest, type Item, type Person } from "@/lib/types";
import { Avatars, Card, Checkbox, CopyButton, LangToggle, PromptPayQR, Switch } from "@/components/ui";

type Me = { id: string; name: string };
type View = "name" | "pick" | "summary";

const CATEGORY_ICON: Record<Category, string> = { food: "🍕", drinks: "🍋", alcohol: "🍷", water: "💧" };

export default function FriendApp({ shareId }: { shareId: string }) {
  const { t } = useLang();
  const { data, setData, status } = usePolling<BillPayload>(`/api/b/${shareId}`);
  const meKey = `splitbill:${shareId}:me`;

  const [me, setMe] = useState<Me | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Restore identity once the bill has first loaded (state adjusted during
  // render; data only exists client-side so this never runs on the server).
  if (data && view === null) {
    let stored: Me | null = null;
    try {
      stored = JSON.parse(storage.get(meKey) ?? "null");
    } catch {}
    if (!stored?.id || !stored.name) setView("name");
    else {
      const savedPerson = data.people.find((p) => p.id === stored.id);
      setMe(stored);
      setDraft(new Set(savedPerson?.unitIds ?? []));
      setView(savedPerson ? "summary" : "pick");
    }
  }

  const saved = data && me ? data.people.find((p) => p.id === me.id) : undefined;

  // Everyone on the guest list (saved or not) plus anyone who typed a name.
  const everyone = useMemo(() => (data ? withRoster(data.bill.roster, data.people) : []), [data]);

  const calcPeople: Person[] = useMemo(() => {
    if (!me || view === "name") return everyone;
    return [
      ...everyone.filter((p) => p.id !== me.id),
      { id: me.id, name: me.name, unitIds: [...draft], paid: saved?.paid ?? false, updatedAt: 0 },
    ];
  }, [everyone, me, view, draft, saved?.paid]);

  const result = useMemo(
    () => (data ? computeBill(data.bill.items, calcPeople, billCharges(data.bill)) : null),
    [data, calcPeople],
  );

  if (status === "notfound") return <Centered>{t("notFound")}</Centered>;
  if (!data || !result || !view) return <Centered>{t("loading")}</Centered>;

  const { bill } = data;
  const mine = me ? result.byId[me.id] : undefined;
  const dirty =
    !saved ||
    saved.name !== me?.name ||
    saved.unitIds.length !== draft.size ||
    saved.unitIds.some((id) => !draft.has(id));

  async function save() {
    if (!me) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = await sendJson<BillPayload>(`/api/b/${shareId}/people/${me.id}`, "PUT", {
        name: me.name,
        unitIds: [...draft],
      });
      setData(payload);
      setView("summary");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setSaveError(e instanceof Error && e.message.includes("locked") ? t("locked") : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function setShared(item: Item, sharedByAll: boolean) {
    try {
      setData(await sendJson<BillPayload>(`/api/b/${shareId}/items/${item.id}`, "PATCH", { sharedByAll }));
    } catch {}
  }

  const roster = bill.roster ?? [];
  const onRoster = (id: string) => roster.some((g) => g.id === id);

  /** Become `who`, loading whatever they saved before (from any phone). */
  function choose(who: Me) {
    const savedPerson = data!.people.find((p) => p.id === who.id);
    setMe(who);
    storage.set(meKey, JSON.stringify(who));
    setDraft(new Set(savedPerson?.unitIds ?? []));
    setView(savedPerson && savedPerson.name === who.name ? "summary" : "pick");
  }

  /** Free-text name for someone not on the guest list. */
  function submitName(name: string) {
    const same = (p: { name: string }) => p.name.toLowerCase() === name.toLowerCase();
    const match = everyone.find(same);
    if (match) return choose({ id: match.id, name: match.name });
    // Renaming yourself keeps your picks, unless you were a guest-list name.
    choose({ id: me && !onRoster(me.id) ? me.id : newId(), name });
  }

  const header = (
    <header className="flex items-start justify-between gap-3 px-4 pt-5 pb-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-accent-ink">{t("appName")}</p>
        <h1 className="truncate text-2xl font-bold text-stone-900">
          {bill.emoji && <span className="mr-1.5">{bill.emoji}</span>}
          {bill.title}
        </h1>
        <p className="text-sm text-stone-500">
          {formatDate(bill.date)} · {roster.length || bill.guests} {t("guests")} · {formatTHB(result.grandTotalSatang)}
        </p>
      </div>
      <LangToggle />
    </header>
  );

  if (view === "name" || !me) {
    return (
      <main className="mx-auto w-full max-w-lg" style={themeStyle(bill.color)}>
        {header}
        <NameForm
          roster={roster}
          savedIds={new Set(data.people.filter((p) => p.unitIds.length > 0).map((p) => p.id))}
          currentId={me?.id}
          initial={me && !onRoster(me.id) ? me.name : ""}
          onChoose={choose}
          onSubmit={submitName}
          t={t}
        />
      </main>
    );
  }

  const showSummary = view === "summary" && saved && mine;

  return (
    <main className="mx-auto w-full max-w-lg pb-40" style={themeStyle(bill.color)}>
      {header}
      <div className="flex items-center justify-between px-4 pb-3">
        <button
          type="button"
          onClick={() => setView("name")}
          className="flex h-11 items-center gap-2 rounded-full bg-white pr-4 pl-1.5 shadow-sm ring-1 ring-stone-200 active:bg-stone-50"
        >
          <Avatars people={[me]} size="md" />
          <span className="font-medium">{t("hi", { name: me.name })}</span>
          <span className="text-sm text-stone-400">✎</span>
        </button>
        <span className="text-xs text-stone-500">
          {t("pickedCount", {
            n: everyone.filter((p) => p.unitIds.length > 0).length,
            total: everyone.length,
          })}
        </span>
      </div>

      {bill.locked && (
        <div className="mx-4 mb-3 rounded-xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">
          🔒 {t("locked")}
        </div>
      )}

      {showSummary ? (
        <Summary
          result={result}
          personId={me.id}
          bill={data.bill}
          locked={bill.locked}
          onEdit={() => setView("pick")}
          t={t}
        />
      ) : (
        <Picker
          items={bill.items}
          result={result}
          people={calcPeople}
          me={me}
          draft={draft}
          setDraft={setDraft}
          locked={bill.locked}
          priceNote={priceNote(bill, t)}
          onShared={setShared}
          t={t}
        />
      )}

      {!showSummary && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{t("yourTotal")}</p>
              <p className="text-2xl font-bold text-stone-900 tabular-nums">
                {formatTHB(mine?.roundedSatang ?? 0)}
              </p>
              <p className="text-xs text-stone-500 tabular-nums">
                {saveError ? (
                  <span className="text-rose-600">{saveError}</span>
                ) : (
                  t("exact", { amount: formatTHB(mine?.totalSatang ?? 0, { decimals: true }) })
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={saving || bill.locked || draft.size === 0 || !dirty}
              onClick={save}
              className="h-14 min-w-32 rounded-2xl bg-accent px-6 text-lg font-semibold text-white shadow-sm active:bg-accent-strong disabled:bg-stone-300"
            >
              {saving ? t("saving") : !dirty ? t("saved") : saved ? t("update") : t("save")}
            </button>
          </div>
          {draft.size === 0 && !bill.locked && (
            <p className="-mt-2 pb-2 text-center text-xs text-stone-400">{t("nothingTicked")}</p>
          )}
        </div>
      )}
    </main>
  );
}

/** Tells friends whether the prices they see are final or get charges added. */
function priceNote(bill: BillPayload["bill"], t: TFn) {
  const parts = [
    bill.serviceBp ? t("serviceShort", { pct: bill.serviceBp / 100 }) : "",
    bill.vatBp ? t("vatShort") : "",
  ].filter(Boolean);
  return parts.length ? t("chargesNote", { charges: parts.join(" + ") }) : t("vatNote");
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-8 text-center text-stone-500">{children}</main>;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function NameForm({
  roster,
  savedIds,
  currentId,
  initial,
  onChoose,
  onSubmit,
  t,
}: {
  roster: Guest[];
  savedIds: Set<string>;
  currentId?: string;
  initial: string;
  onChoose: (g: Guest) => void;
  onSubmit: (name: string) => void;
  t: TFn;
}) {
  const [name, setName] = useState(initial);
  const [typing, setTyping] = useState(roster.length === 0 || !!initial);
  const trimmed = name.trim();
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name, "th"));
  return (
    <div className="space-y-3 px-4">
      {sorted.length > 0 && (
        <Card>
          <h2 className="text-xl font-semibold">{t("whoAreYou")}</h2>
          <p className="mt-1 mb-3 text-sm text-stone-500">{t("pickName")}</p>
          <div className="grid grid-cols-2 gap-2">
            {sorted.map((g) => {
              const isMe = g.id === currentId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onChoose(g)}
                  className={`flex min-h-14 items-center gap-2.5 rounded-2xl border-2 px-3 text-left active:bg-stone-100 ${
                    isMe ? "border-accent bg-accent-soft" : "border-stone-200 bg-white"
                  }`}
                >
                  <Avatars people={[g]} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold">{g.name}</span>
                    {savedIds.has(g.id) && (
                      <span className="block text-xs text-accent-ink">✓ {t("picked")}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {typing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) onSubmit(trimmed.slice(0, 40));
          }}
        >
          <Card>
            <label htmlFor="name" className="block text-lg font-semibold">
              {sorted.length ? t("notOnList") : t("yourName")}
            </label>
            <input
              id="name"
              autoFocus={sorted.length === 0}
              autoComplete="given-name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="mt-3 h-14 w-full rounded-xl border border-stone-300 px-4 text-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <p className="mt-2 text-sm text-stone-500">{t("nameHint")}</p>
            <button
              type="submit"
              disabled={!trimmed}
              className="mt-4 h-14 w-full rounded-2xl bg-accent text-lg font-semibold text-white active:bg-accent-strong disabled:bg-stone-300"
            >
              {t("continue")}
            </button>
          </Card>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setTyping(true)}
          className="h-12 w-full text-sm font-medium text-stone-500 underline underline-offset-4"
        >
          {t("notOnList")}
        </button>
      )}
    </div>
  );
}

function Picker({
  items,
  result,
  people,
  me,
  draft,
  setDraft,
  locked,
  priceNote,
  onShared,
  t,
}: {
  items: Item[];
  result: BillResult;
  people: Person[];
  me: Me;
  draft: Set<string>;
  setDraft: (s: Set<string>) => void;
  locked: boolean;
  priceNote: string;
  onShared: (item: Item, v: boolean) => void;
  t: TFn;
}) {
  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, { id: p.id, name: p.name }]));
    m.set(me.id, me);
    return m;
  }, [people, me]);
  const unitsByItem = useMemo(() => {
    const m = new Map<string, UnitResult[]>();
    for (const u of result.units) m.set(u.item.id, [...(m.get(u.item.id) ?? []), u]);
    return m;
  }, [result.units]);
  const myLines = new Map(result.byId[me.id]?.lines.map((l) => [l.unitId, l]) ?? []);
  const everyoneCount = result.people.length;

  const toggle = (id: string) => {
    if (locked) return;
    const next = new Set(draft);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  };
  const tickable = expandUnits(items.filter((i) => !i.sharedByAll)).map((u) => u.id);
  const alcohol = new Set(expandUnits(items.filter((i) => i.category === "alcohol")).map((u) => u.id));

  // Unclaimed by others (my draft counts as claimed).
  const unclaimed = result.unclaimed;

  return (
    <div className="space-y-4 px-4">
      {!locked && (
        <Card>
          <p className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("quick")}</p>
          <div className="flex flex-wrap gap-2">
            <QuickButton onClick={() => setDraft(new Set(tickable))}>⚖️ {t("splitAll")}</QuickButton>
            <QuickButton onClick={() => setDraft(new Set([...draft].filter((id) => !alcohol.has(id))))}>
              🚫🍷 {t("skipAlcohol")}
            </QuickButton>
            <QuickButton onClick={() => setDraft(new Set())}>✕ {t("clear")}</QuickButton>
          </div>
          <p className="mt-2 text-xs text-stone-500">{t("splitAllHint")}</p>
        </Card>
      )}

      {unclaimed.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
          ⚠️{" "}
          {t("unclaimedBanner", {
            count: unclaimed.length,
            amount: (result.unclaimedSatang / 100).toLocaleString("en-US"),
          })}
        </div>
      )}

      <p className="px-1 text-xs text-stone-500">{priceNote}</p>

      {CATEGORIES.map((cat) => {
        const catItems = items.filter((i) => i.category === cat);
        if (!catItems.length) return null;
        const pickedCount = catItems
          .flatMap((i) => unitsByItem.get(i.id) ?? [])
          .filter((u) => u.claimants.includes(me.id)).length;
        return (
          <section key={cat}>
            <h2 className="mb-2 flex items-center gap-2 px-1 text-lg font-bold">
              <span>{CATEGORY_ICON[cat]}</span>
              {t(cat)}
              {pickedCount > 0 && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">
                  {pickedCount}
                </span>
              )}
            </h2>
            <div className="space-y-2">
              {catItems.map((item) => {
                const units = unitsByItem.get(item.id) ?? [];
                const others = (u: UnitResult) =>
                  u.claimants.filter((id) => id !== me.id).map((id) => nameOf.get(id)!).filter(Boolean);

                if (item.sharedByAll) {
                  const share = units.reduce((s, u) => s + (myLines.get(u.id)?.shareSatang ?? 0), 0);
                  return (
                    <Card key={item.id} className="!p-3">
                      <ItemHeader item={item} t={t} />
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-sky-50 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="font-medium text-sky-900">{t("sharedByAll")}</p>
                          <p className="text-xs text-sky-800">{t("sharedByAllHint", { n: everyoneCount })}</p>
                        </div>
                        <Switch checked label={t("sharedByAll")} disabled={locked} onChange={(v) => onShared(item, v)} />
                      </div>
                      <div className="mt-2 flex items-center justify-between px-1 text-sm">
                        <Avatars people={[...nameOf.values()].filter((p) => units[0]?.claimants.includes(p.id))} max={8} />
                        <span className="font-semibold tabular-nums">
                          {t("yourShare")} {formatTHB(share)}
                        </span>
                      </div>
                    </Card>
                  );
                }

                const sharedToggle = cat === "water" && (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
                    <span className="text-sm text-stone-700">{t("sharedByAll")}</span>
                    <Switch checked={false} label={t("sharedByAll")} disabled={locked} onChange={(v) => onShared(item, v)} />
                  </div>
                );

                if (units.length === 1) {
                  const u = units[0];
                  return (
                    <UnitRow
                      key={item.id}
                      title={item.name}
                      price={item.unitPriceSatang}
                      checked={draft.has(u.id)}
                      share={myLines.get(u.id)}
                      others={others(u)}
                      onToggle={() => toggle(u.id)}
                      disabled={locked}
                      t={t}
                    />
                  );
                }

                if (units.length >= 4) {
                  return (
                    <Card key={item.id} className="!p-3">
                      <ItemHeader item={item} t={t} />
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {units.map((u) => {
                          const on = draft.has(u.id);
                          const o = others(u);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              disabled={locked}
                              onClick={() => toggle(u.id)}
                              aria-pressed={on}
                              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-semibold transition-colors ${
                                on ? "border-accent bg-accent-soft text-accent-ink" : "border-stone-200 bg-white text-stone-700"
                              }`}
                            >
                              #{u.index}
                              {o.length > 0 ? <Avatars people={o} max={2} /> : <span className="h-6" />}
                            </button>
                          );
                        })}
                      </div>
                      {sharedToggle}
                    </Card>
                  );
                }

                return (
                  <Card key={item.id} className="!p-3">
                    <ItemHeader item={item} t={t} />
                    <div className="mt-1 divide-y divide-stone-100">
                      {units.map((u) => (
                        <UnitRow
                          key={u.id}
                          bare
                          title={`#${u.index}`}
                          price={u.priceSatang}
                          checked={draft.has(u.id)}
                          share={myLines.get(u.id)}
                          others={others(u)}
                          onToggle={() => toggle(u.id)}
                          disabled={locked}
                          t={t}
                        />
                      ))}
                    </div>
                    {sharedToggle}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function QuickButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 rounded-full border border-stone-200 bg-stone-50 px-4 text-sm font-medium text-stone-800 active:bg-stone-200"
    >
      {children}
    </button>
  );
}

function ItemHeader({ item, t }: { item: Item; t: TFn }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <p className="font-semibold text-stone-900">
        {item.name}
        {item.manual && <span className="ml-1 text-xs font-normal text-stone-400">(+)</span>}
      </p>
      <p className="shrink-0 text-sm text-stone-500 tabular-nums">
        {item.qty} × {formatTHB(item.unitPriceSatang)} {t("each")}
      </p>
    </div>
  );
}

function UnitRow({
  title,
  price,
  checked,
  share,
  others,
  onToggle,
  disabled,
  bare,
  t,
}: {
  title: string;
  price: number;
  checked: boolean;
  share?: { shareSatang: number; sharedWith: number };
  others: { id: string; name: string }[];
  onToggle: () => void;
  disabled: boolean;
  bare?: boolean;
  t: TFn;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={checked}
      className={`flex min-h-14 w-full items-center gap-3 text-left transition-colors ${
        bare
          ? "px-1 py-2"
          : `rounded-2xl px-3 py-3 shadow-sm ring-1 ${checked ? "bg-accent-soft ring-accent-ring" : "bg-white ring-stone-200/70"}`
      }`}
    >
      <Checkbox checked={checked} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-stone-900">{title}</span>
        {checked && share && share.sharedWith > 1 && (
          <span className="block text-xs text-accent-ink tabular-nums">
            {t("yourShare")} {formatTHB(share.shareSatang, { decimals: true })} ({t("splitN", { n: share.sharedWith })})
          </span>
        )}
      </span>
      <Avatars people={others} max={3} />
      <span className="shrink-0 text-sm text-stone-600 tabular-nums">{formatTHB(price)}</span>
    </button>
  );
}

function Summary({
  result,
  personId,
  bill,
  locked,
  onEdit,
  t,
}: {
  result: BillResult;
  personId: string;
  bill: BillPayload["bill"];
  locked: boolean;
  onEdit: () => void;
  t: TFn;
}) {
  const mine = result.byId[personId];
  const { payment } = bill;
  const hasBank = payment.accountNo || payment.bankName;
  const amountText = (mine.roundedSatang / 100).toFixed(2);
  return (
    <div className="space-y-4 px-4">
      <Card>
        <h2 className="mb-2 text-lg font-bold">{t("breakdown")}</h2>
        <ul className="divide-y divide-stone-100 text-sm">
          {mine.lines.map((l) => (
            <li key={l.unitId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                {l.label}
                {l.sharedWith > 1 && (
                  <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                    {formatTHB(l.priceSatang)} {t("splitN", { n: l.sharedWith })}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">{formatTHB(l.shareSatang, { decimals: true })}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-stone-200 pt-2 text-sm">
          {mine.totalSatang !== mine.subtotalSatang && (
            <Row label={t("subtotal")} value={formatTHB(mine.subtotalSatang, { decimals: true })} />
          )}
          {mine.serviceSatang > 0 && (
            <Row
              label={t("serviceCharge", { pct: (bill.serviceBp ?? 0) / 100 })}
              value={formatTHB(mine.serviceSatang, { decimals: true })}
            />
          )}
          {mine.vatSatang > 0 && <Row label={t("vat")} value={formatTHB(mine.vatSatang, { decimals: true })} />}
          {mine.extraSatang > 0 && (
            <Row label={bill.extraLabel} value={formatTHB(mine.extraSatang, { decimals: true })} />
          )}
          <Row label={t("total")} value={formatTHB(mine.totalSatang, { decimals: true })} />
        </dl>
        <div className="mt-3 flex items-end justify-between rounded-xl bg-accent-soft px-4 py-3">
          <span className="font-semibold text-accent-ink">{t("youPay")}</span>
          <span className="text-3xl font-bold text-accent-ink tabular-nums">{formatTHB(mine.roundedSatang)}</span>
        </div>
        <p className="mt-2 text-xs text-stone-500">{t("roundNote")}</p>
        {!locked && (
          <button
            type="button"
            onClick={onEdit}
            className="mt-3 h-12 w-full rounded-xl border border-stone-300 font-semibold text-stone-800 active:bg-stone-100"
          >
            ✎ {t("editSelection")}
          </button>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center justify-between text-lg font-bold">
          {t("payment")}
          {mine.paid && (
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">✓ {t("paid")}</span>
          )}
        </h2>
        {mine.paid && <p className="mb-3 text-sm text-accent-ink">{t("markedPaid")}</p>}
        {!payment.promptpay && !hasBank && <p className="text-sm text-stone-500">{t("noPayment")}</p>}
        {payment.promptpay && mine.roundedSatang > 0 && (
          <>
            <PromptPayQR target={payment.promptpay} amountSatang={mine.roundedSatang} />
            <p className="mt-2 text-center text-xs text-stone-500">{t("scanToPay")}</p>
          </>
        )}
        <div className="mt-3 space-y-2">
          <CopyRow label={t("amount")} value={`${formatTHB(mine.roundedSatang)}`} copy={amountText} />
          {payment.promptpay && <CopyRow label={t("promptpay")} value={payment.promptpay} copy={payment.promptpay} />}
          {payment.bankName && <CopyRow label={t("bank")} value={payment.bankName} />}
          {payment.accountNo && (
            <CopyRow label={t("account")} value={payment.accountNo} copy={payment.accountNo.replace(/[^0-9]/g, "")} />
          )}
          {payment.accountName && <CopyRow label={t("accountName")} value={payment.accountName} />}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone-600">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function CopyRow({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-xl bg-stone-50 px-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-stone-500">{label}</p>
        <p className="truncate font-semibold tabular-nums">{value}</p>
      </div>
      {copy && <CopyButton text={copy} />}
    </div>
  );
}
