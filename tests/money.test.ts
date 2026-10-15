import { describe, expect, it } from "vitest";
import {
  allocateProportional,
  chargesOn,
  computeBill,
  expandUnits,
  itemsTotal,
  roundUpToBaht,
  splitEvenly,
  unitId,
  withRoster,
} from "../lib/money";
import { SEED_ITEMS, SEED_META, SEED_ROSTER } from "../lib/seed-data";
import type { Item, Person } from "../lib/types";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const person = (id: string, unitIds: string[]): Person => ({
  id,
  name: id,
  unitIds,
  paid: false,
  updatedAt: 0,
});

describe("receipt seed", () => {
  it("sums to 945,900 satang (9,459 THB incl. VAT)", () => {
    expect(itemsTotal(SEED_ITEMS)).toBe(945900);
    expect(SEED_META.receiptTotalSatang).toBe(945900);
  });

  it("expands into one row per unit", () => {
    const units = expandUnits(SEED_ITEMS);
    expect(units).toHaveLength(sum(SEED_ITEMS.map((i) => i.qty)));
    expect(units.filter((u) => u.item.name === "Still Water")).toHaveLength(12);
    expect(units.map((u) => u.label)).toContain("Chicken Wings #2");
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
  });

  it("uses only integer satang", () => {
    for (const it of SEED_ITEMS) expect(Number.isInteger(it.unitPriceSatang)).toBe(true);
  });
});

describe("splitEvenly", () => {
  it("splits exactly when divisible", () => {
    expect(splitEvenly(89000, 4)).toEqual([22250, 22250, 22250, 22250]);
  });

  it("distributes leftover satang so the sum matches", () => {
    const parts = splitEvenly(10000, 3);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(sum(parts)).toBe(10000);
  });

  it("rotates who gets the leftover via offset", () => {
    expect(splitEvenly(10000, 3, 1)).toEqual([3333, 3334, 3333]);
    expect(splitEvenly(10000, 3, 5)).toEqual([3333, 3333, 3334]);
  });

  it("handles odd prices across many people", () => {
    for (let n = 1; n <= 12; n++) {
      const parts = splitEvenly(18900, n, 7);
      expect(sum(parts)).toBe(18900);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    }
  });

  it("returns nothing for zero people", () => {
    expect(splitEvenly(100, 0)).toEqual([]);
  });
});

describe("allocateProportional", () => {
  it("sums exactly and follows weights", () => {
    const parts = allocateProportional(50000, [100000, 200000, 0]);
    expect(sum(parts)).toBe(50000);
    expect(parts).toEqual([16667, 33333, 0]);
  });

  it("falls back to even split when all weights are zero", () => {
    expect(allocateProportional(1000, [0, 0, 0])).toEqual([334, 333, 333]);
  });
});

describe("roundUpToBaht", () => {
  it("rounds up to whole baht", () => {
    expect(roundUpToBaht(3334)).toBe(3400);
    expect(roundUpToBaht(3300)).toBe(3300);
    expect(roundUpToBaht(1)).toBe(100);
    expect(roundUpToBaht(0)).toBe(0);
  });
});

describe("computeBill", () => {
  const items: Item[] = [
    { id: "wine", name: "Wine", category: "alcohol", qty: 1, unitPriceSatang: 89000 },
    { id: "pizza", name: "Pizza", category: "food", qty: 2, unitPriceSatang: 39000 },
    { id: "water", name: "Water", category: "water", qty: 3, unitPriceSatang: 3000, sharedByAll: true },
    { id: "beer", name: "Beer", category: "alcohol", qty: 1, unitPriceSatang: 18900 },
  ];

  it("shares a unit equally among claimants and reports unclaimed units", () => {
    const res = computeBill(items, [
      person("a", [unitId("wine", 1), unitId("pizza", 1)]),
      person("b", [unitId("wine", 1)]),
      person("c", [unitId("wine", 1), unitId("pizza", 1)]),
    ]);
    expect(res.byId.a.lines.find((l) => l.unitId === "wine#1")!.shareSatang).toBeGreaterThanOrEqual(29666);
    expect(res.unclaimed.map((u) => u.id)).toEqual(["pizza#2", "beer#1"]);
    expect(res.unclaimedSatang).toBe(39000 + 18900);
    // Water is shared by all three regardless of ticks.
    expect(res.byId.b.lines.filter((l) => l.unitId.startsWith("water"))).toHaveLength(3);
    // Every satang is accounted for.
    expect(res.sharesTotalSatang + res.unclaimedSatang).toBe(res.itemsTotalSatang);
  });

  it("splits extra proportionally and keeps the total exact", () => {
    const res = computeBill(
      items,
      [
        person("a", ["wine#1", "pizza#1", "pizza#2", "beer#1"]),
        person("b", ["wine#1"]),
        person("c", []),
      ],
      { extraSatang: 10001 },
    );
    expect(res.unclaimedSatang).toBe(0);
    expect(res.sharesTotalSatang).toBe(res.itemsTotalSatang + 10001);
    expect(res.byId.a.extraSatang).toBeGreaterThan(res.byId.b.extraSatang);
    for (const p of res.people) {
      expect(p.roundedSatang % 100).toBe(0);
      expect(p.roundedSatang - p.totalSatang).toBeGreaterThanOrEqual(0);
      expect(p.roundedSatang - p.totalSatang).toBeLessThan(100);
    }
    expect(res.surplusSatang).toBe(res.roundedTotalSatang - res.sharesTotalSatang);
  });

  it("matches the real receipt when 12 people split everything evenly", () => {
    const all = expandUnits(SEED_ITEMS).map((u) => u.id);
    const people = Array.from({ length: 12 }, (_, i) => person(`p${String(i).padStart(2, "0")}`, all));
    const res = computeBill(SEED_ITEMS, people);
    expect(res.unclaimed).toHaveLength(0);
    expect(res.sharesTotalSatang).toBe(945900);
    const totals = res.people.map((p) => p.totalSatang);
    // 945900 / 12 = 78825 exactly; leftover rotation must not skew anyone.
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    expect(sum(totals)).toBe(945900);
  });

  it("is independent of the order people are passed in", () => {
    const ps = [person("x", ["beer#1"]), person("m", ["beer#1"]), person("c", ["beer#1"])];
    const a = computeBill(items, ps);
    const b = computeBill(items, [...ps].reverse());
    expect(a.people.map((p) => [p.id, p.totalSatang])).toEqual(
      b.people.map((p) => [p.id, p.totalSatang]),
    );
  });

  it("handles no people", () => {
    const res = computeBill(items, [], { extraSatang: 5000 });
    expect(res.unclaimedSatang).toBe(res.itemsTotalSatang);
    expect(res.sharesTotalSatang).toBe(0);
  });
});

describe("guest list", () => {
  it("has 12 unique names matching the receipt's guest count", () => {
    expect(SEED_ROSTER).toHaveLength(SEED_META.guests);
    expect(new Set(SEED_ROSTER.map((g) => g.name)).size).toBe(12);
    expect(new Set(SEED_ROSTER.map((g) => g.id)).size).toBe(12);
  });

  it("splits shared-by-everyone items across all guests, saved or not", () => {
    const items: Item[] = SEED_ITEMS.map((i) => ({ ...i, sharedByAll: i.category === "water" }));
    const people = withRoster(SEED_ROSTER, [person(SEED_ROSTER[0].id, ["chicken-wings#1"])]);
    expect(people).toHaveLength(12);
    const res = computeBill(items, people);
    // 12 waters x 30 THB over 12 guests = 30 THB each.
    for (const p of res.people) {
      const water = p.lines.filter((l) => l.category === "water").reduce((s, l) => s + l.shareSatang, 0);
      expect(water).toBe(3000);
    }
    expect(res.byId[SEED_ROSTER[0].id].subtotalSatang).toBe(3000 + 19000);
  });

  it("keeps guest-list names and appends people not on the list", () => {
    const people = withRoster(SEED_ROSTER.slice(0, 2), [
      { ...person(SEED_ROSTER[1].id, ["beer#1"]), name: "typo" },
      person("outsider-1234", []),
    ]);
    expect(people.map((p) => p.name)).toEqual([SEED_ROSTER[0].name, SEED_ROSTER[1].name, "outsider-1234"]);
    expect(people[1].unitIds).toEqual(["beer#1"]);
  });

  it("12 guests splitting everything pay 788.25 THB exact, 789 rounded", () => {
    const all = expandUnits(SEED_ITEMS).map((u) => u.id);
    const res = computeBill(SEED_ITEMS, SEED_ROSTER.map((g) => person(g.id, all)));
    for (const p of res.people) {
      expect(p.totalSatang).toBe(78825);
      expect(p.roundedSatang).toBe(78900);
    }
    expect(res.surplusSatang).toBe(12 * 75);
  });
});

describe("service charge and VAT", () => {
  const items: Item[] = [
    { id: "steak", name: "Steak", category: "food", qty: 1, unitPriceSatang: 100000 },
    { id: "salad", name: "Salad", category: "food", qty: 1, unitPriceSatang: 33300 },
  ];

  it("applies service first, then VAT on top (Thai style)", () => {
    expect(chargesOn(100000, 1000, 700)).toEqual({ service: 10000, vat: 7700 });
  });

  it("splits charges by what each person ordered and sums exactly", () => {
    const res = computeBill(items, [person("a", ["steak#1"]), person("b", ["salad#1"])], {
      serviceBp: 1000,
      vatBp: 700,
    });
    const { service, vat } = chargesOn(133300, 1000, 700);
    expect(res.serviceSatang).toBe(service);
    expect(res.vatSatang).toBe(vat);
    expect(res.byId.a.serviceSatang).toBe(10000);
    expect(res.byId.a.vatSatang).toBe(7700);
    expect(res.byId.a.totalSatang).toBe(117700);
    expect(res.sharesTotalSatang).toBe(res.grandTotalSatang);
    expect(res.grandTotalSatang).toBe(133300 + service + vat);
  });

  it("doesn't charge anyone service on unclaimed items", () => {
    const res = computeBill(items, [person("a", ["salad#1"])], { serviceBp: 1000 });
    expect(res.byId.a.serviceSatang).toBe(3330);
    expect(res.serviceSatang).toBe(13330);
    expect(res.grandTotalSatang - res.sharesTotalSatang).toBe(100000 + 10000);
  });

  it("matches the old behavior when prices include VAT and there is no service", () => {
    const res = computeBill(SEED_ITEMS, SEED_ROSTER.map((g) => person(g.id, [])), { serviceBp: 0, vatBp: 0 });
    expect(res.grandTotalSatang).toBe(945900);
  });
});
