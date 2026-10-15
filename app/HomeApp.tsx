"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { storage } from "@/lib/client";
import { forgetBill, type MyBill } from "@/lib/host-storage";
import { Card } from "@/components/ui";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export default function HomeApp() {
  // Raw string from localStorage; null during server render.
  const raw = useSyncExternalStore(subscribe, () => storage.get("splitbill:bills") ?? "[]", () => null);
  const bills = useMemo<MyBill[]>(() => {
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [raw]);

  return (
    <main className="mx-auto w-full max-w-lg space-y-4 px-4 pt-10 pb-16">
      <header className="text-center">
        <p className="text-5xl">🧾</p>
        <h1 className="mt-2 text-2xl font-bold">Split the bill</h1>
        <p className="mt-1 text-stone-600">Everyone ticks what they had and sees what they owe.</p>
      </header>

      <Link href="/new" className="flex h-14 items-center justify-center rounded-2xl bg-accent text-lg font-semibold text-white active:bg-accent-strong">
        + New bill
      </Link>

      {raw !== null && bills.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <h2 className="px-4 pt-4 pb-2 text-lg font-bold">My bills</h2>
          <ul className="divide-y divide-stone-100">
            {bills.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl">{b.emoji || "🧾"}</span>
                <Link href={`/admin/${b.adminToken}`} className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{b.title}</span>
                  <span className="block text-xs text-stone-500">{b.date}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove "${b.title}" from this list? The bill itself is kept.`)) {
                      forgetBill(b.id);
                      listeners.forEach((cb) => cb());
                    }
                  }}
                  className="h-9 w-9 rounded-full text-stone-400 active:bg-stone-100"
                  aria-label={`Hide ${b.title}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-center text-sm text-stone-500">
        Got a link from a friend? Open that link to pick what you had.
        <br />
        Bills you create or open as host on this phone show up here.
      </p>
    </main>
  );
}
