import type { Guest, Item, Person } from "./types";

/**
 * All money is integer satang (1 THB = 100 satang). Prices already include
 * 7% VAT, so nothing here ever adds tax.
 */

export const baht = (thb: number) => Math.round(thb * 100);

export function formatTHB(satang: number, opts: { decimals?: boolean } = {}) {
  const showDecimals = opts.decimals ?? satang % 100 !== 0;
  return (
    "฿" +
    (satang / 100).toLocaleString("en-US", {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    })
  );
}

/** Round up to the next whole baht (host keeps the surplus). */
export const roundUpToBaht = (satang: number) => Math.ceil(satang / 100) * 100;

/**
 * Split `amount` satang into `n` near-equal integer parts that sum exactly to
 * `amount`. The leftover satang go to the parts starting at `offset`, so that
 * across many units the same person doesn't always absorb the extra.
 */
export function splitEvenly(amount: number, n: number, offset = 0): number[] {
  if (n <= 0) return [];
  const base = Math.floor(amount / n);
  const parts = new Array<number>(n).fill(base);
  let leftover = amount - base * n;
  for (let k = 0; leftover > 0; k++, leftover--) parts[(offset + k) % n] += 1;
  return parts;
}

/**
 * Allocate `amount` proportionally to `weights` with the largest-remainder
 * method, so the parts are integers that sum exactly to `amount`. If every
 * weight is zero, it falls back to an even split.
 */
export function allocateProportional(amount: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return splitEvenly(amount, n);
  const exact = weights.map((w) => (amount * w) / totalWeight);
  const parts = exact.map(Math.floor);
  let leftover = amount - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; leftover > 0; k++, leftover--) parts[order[k % n].i] += 1;
  return parts;
}

/** Like splitEvenly, but leftovers go to the claimants with the least absorbed. */
function splitFairly(amount: number, claimants: string[], absorbed: Map<string, number>) {
  const n = claimants.length;
  if (n === 0) return [];
  const base = Math.floor(amount / n);
  const parts = new Array<number>(n).fill(base);
  const leftover = amount - base * n;
  const order = claimants
    .map((id, k) => ({ id, k }))
    .sort((a, b) => absorbed.get(a.id)! - absorbed.get(b.id)! || a.k - b.k);
  for (let j = 0; j < leftover; j++) {
    const { id, k } = order[j];
    parts[k] += 1;
    absorbed.set(id, absorbed.get(id)! + 1);
  }
  return parts;
}

/**
 * Everyone on the bill: every guest-list name (even if they haven't saved yet,
 * so "shared by everyone" items are split across the whole table) plus anyone
 * who saved under a name not on the list.
 */
export function withRoster(roster: Guest[] = [], people: Person[]): Person[] {
  const saved = new Map(people.map((p) => [p.id, p]));
  const fromRoster = roster.map((g) => {
    const p = saved.get(g.id);
    return p
      ? { ...p, name: g.name }
      : { id: g.id, name: g.name, unitIds: [], paid: false, updatedAt: 0 };
  });
  const rosterIds = new Set(roster.map((g) => g.id));
  return [...fromRoster, ...people.filter((p) => !rosterIds.has(p.id))];
}

export const unitId = (itemId: string, index: number) => `${itemId}#${index}`;

export interface Unit {
  id: string;
  item: Item;
  index: number;
  label: string;
  priceSatang: number;
}

export function expandUnits(items: Item[]): Unit[] {
  return items.flatMap((item) =>
    Array.from({ length: item.qty }, (_, i) => ({
      id: unitId(item.id, i + 1),
      item,
      index: i + 1,
      label: item.qty > 1 ? `${item.name} #${i + 1}` : item.name,
      priceSatang: item.unitPriceSatang,
    })),
  );
}

export const itemsTotal = (items: Item[]) =>
  items.reduce((sum, it) => sum + it.qty * it.unitPriceSatang, 0);

export interface Line {
  unitId: string;
  label: string;
  category: Item["category"];
  priceSatang: number;
  shareSatang: number;
  sharedWith: number;
}

export interface PersonResult {
  id: string;
  name: string;
  paid: boolean;
  lines: Line[];
  subtotalSatang: number;
  extraSatang: number;
  totalSatang: number;
  /** What we actually ask the person to pay. */
  roundedSatang: number;
}

export interface UnitResult extends Unit {
  claimants: string[];
}

export interface BillResult {
  units: UnitResult[];
  people: PersonResult[];
  byId: Record<string, PersonResult>;
  itemsTotalSatang: number;
  claimedSatang: number;
  unclaimed: UnitResult[];
  unclaimedSatang: number;
  extraSatang: number;
  /** Sum of exact person totals (claimed items + extra). */
  sharesTotalSatang: number;
  /** Sum of rounded-up person totals. */
  roundedTotalSatang: number;
  surplusSatang: number;
}

/**
 * Compute every person's share. Deterministic: people are ordered by id so
 * every client and the server agree on who absorbs leftover satang.
 */
export function computeBill(
  items: Item[],
  peopleIn: Person[],
  extraSatang = 0,
): BillResult {
  const people = [...peopleIn].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const everyone = people.map((p) => p.id);
  const claimSets = new Map(people.map((p) => [p.id, new Set(p.unitIds)]));

  const results: PersonResult[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    paid: p.paid,
    lines: [],
    subtotalSatang: 0,
    extraSatang: 0,
    totalSatang: 0,
    roundedSatang: 0,
  }));
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));

  // Leftover satang from uneven splits go to whoever has absorbed the fewest
  // so far, so nobody accumulates more than 1 satang of rounding per bill.
  const absorbed = new Map(everyone.map((id) => [id, 0]));

  const units: UnitResult[] = expandUnits(items).map((u) => {
    const claimants = u.item.sharedByAll
      ? everyone
      : everyone.filter((id) => claimSets.get(id)!.has(u.id));
    const parts = splitFairly(u.priceSatang, claimants, absorbed);
    claimants.forEach((pid, k) => {
      const r = byId[pid];
      r.lines.push({
        unitId: u.id,
        label: u.label,
        category: u.item.category,
        priceSatang: u.priceSatang,
        shareSatang: parts[k],
        sharedWith: claimants.length,
      });
      r.subtotalSatang += parts[k];
    });
    return { ...u, claimants };
  });

  const extras = allocateProportional(
    extraSatang,
    results.map((r) => r.subtotalSatang),
  );
  results.forEach((r, i) => {
    r.extraSatang = extras[i] ?? 0;
    r.totalSatang = r.subtotalSatang + r.extraSatang;
    r.roundedSatang = roundUpToBaht(r.totalSatang);
  });

  const unclaimed = units.filter((u) => u.claimants.length === 0);
  const unclaimedSatang = unclaimed.reduce((s, u) => s + u.priceSatang, 0);
  const total = itemsTotal(items);
  const sharesTotalSatang = results.reduce((s, r) => s + r.totalSatang, 0);
  const roundedTotalSatang = results.reduce((s, r) => s + r.roundedSatang, 0);

  return {
    units,
    people: results,
    byId,
    itemsTotalSatang: total,
    claimedSatang: total - unclaimedSatang,
    unclaimed,
    unclaimedSatang,
    extraSatang: results.length ? extraSatang : 0,
    sharesTotalSatang,
    roundedTotalSatang,
    surplusSatang: roundedTotalSatang - sharesTotalSatang,
  };
}
