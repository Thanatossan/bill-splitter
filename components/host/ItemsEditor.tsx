"use client";

import { useRef, useState } from "react";
import { formatTHB } from "@/lib/money";
import { draftTotalSatang, newKey, parseReceiptText, type DraftItem } from "@/lib/receipt";
import { sendJson } from "@/lib/client";
import { CATEGORIES, type Category } from "@/lib/types";
import { inputCls, secondaryCls } from "./form";

const CAT_LABEL: Record<Category, string> = { food: "🍕 Food", drinks: "🍋 Drinks", alcohol: "🍷 Alcohol", water: "💧 Water" };

export interface ScanResult {
  restaurant_name: string | null;
  items: { name: string; qty: number; unit_price: number; category: Category }[];
  service_charge_percent: number;
  prices_include_vat: boolean;
  receipt_total: number | null;
  notes: string;
}

/** Shrink a photo to a JPEG under ~1 MB so it fits Vercel's request limit. */
async function photoToJpeg(file: File, maxSide = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't open that image"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ItemsEditor({
  items,
  onChange,
  passcode,
  adminToken,
  aiEnabled,
  onScanned,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  passcode?: string;
  adminToken?: string;
  aiEnabled: boolean;
  onScanned?: (scan: ScanResult) => void;
}) {
  const [pasteOpen, setPasteOpen] = useState(items.length === 0);
  const [text, setText] = useState("");
  const [lineTotals, setLineTotals] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<DraftItem>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  // Replace the trailing empty row (if any) instead of leaving it dangling.
  const append = (more: Omit<DraftItem, "key">[]) =>
    onChange([...items.filter((i) => i.name.trim() || i.price.trim()), ...more.map((m) => ({ ...m, key: newKey() }))]);

  async function scan(file: File) {
    setScanning(true);
    setScanMsg(null);
    try {
      const image = await photoToJpeg(file);
      const res = await sendJson<ScanResult>("/api/scan", "POST", { passcode, adminToken, image });
      append(
        res.items.map((i) => ({
          name: i.name,
          category: i.category,
          qty: String(Math.max(1, Math.round(i.qty))),
          price: String(Math.round(i.unit_price * 100) / 100),
        })),
      );
      onScanned?.(res);
      setScanMsg({
        ok: true,
        text: `Found ${res.items.length} items. Check them against the receipt.${res.notes ? ` Note: ${res.notes}` : ""}`,
      });
    } catch (e) {
      setScanMsg({ ok: false, text: e instanceof Error ? e.message : "Scan failed" });
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {aiEnabled && (
          <>
            <button
              type="button"
              className="h-12 flex-1 rounded-xl bg-stone-900 px-4 font-semibold text-white active:bg-stone-700 disabled:opacity-60"
              disabled={scanning}
              onClick={() => fileRef.current?.click()}
            >
              {scanning ? "Reading receipt… (about 20s)" : "📷 Scan receipt photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])}
            />
          </>
        )}
        <button type="button" className={secondaryCls + " !h-12 flex-1"} onClick={() => setPasteOpen((v) => !v)}>
          📋 Paste as text
        </button>
      </div>
      {!aiEnabled && (
        <p className="rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-600">
          📷 Photo scanning is off. Add <code>ANTHROPIC_API_KEY</code> in Vercel and redeploy to turn it on.
        </p>
      )}
      {scanMsg && (
        <p className={`rounded-xl px-3 py-2 text-sm ${scanMsg.ok ? "bg-accent-soft text-accent-ink" : "bg-rose-50 text-rose-700"}`}>
          {scanMsg.text}
        </p>
      )}

      {pasteOpen && (
        <div className="rounded-xl bg-stone-50 p-3">
          <textarea
            className={inputCls + " !h-36 py-2 font-mono text-sm"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"One item per line, e.g.\nChicken Wings 2 x 190\nMargherita Pizza 360\nStill Water 12 30"}
            aria-label="Receipt text"
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={lineTotals} onChange={(e) => setLineTotals(e.target.checked)} className="h-5 w-5" />
            Amounts are line totals (divide by qty)
          </label>
          <button
            type="button"
            className={secondaryCls + " mt-2"}
            disabled={!text.trim()}
            onClick={() => {
              const { items: parsed, skipped: bad } = parseReceiptText(text, { lineTotals });
              append(parsed);
              setSkipped(bad);
              setText(bad.join("\n"));
            }}
          >
            Add these items
          </button>
          {skipped.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Couldn&apos;t read {skipped.length} line{skipped.length > 1 ? "s" : ""} (left in the box). Fix them or add them below.
            </p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => {
            const line = Number(it.qty) * Number(it.price.replace(/,/g, ""));
            return (
              <li key={it.key} className="rounded-xl border border-stone-200 bg-white p-2.5">
                <div className="flex gap-2">
                  <input
                    className={inputCls + " !h-11 flex-1"}
                    value={it.name}
                    onChange={(e) => update(it.key, { name: e.target.value })}
                    placeholder="Item name"
                    aria-label="Item name"
                  />
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((i) => i.key !== it.key))}
                    className="h-11 w-11 shrink-0 rounded-xl text-stone-400 active:bg-stone-100"
                    aria-label={`Remove ${it.name || "item"}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    className={inputCls + " !h-11 !w-auto shrink-0 pr-1 text-sm"}
                    value={it.category}
                    onChange={(e) => update(it.key, { category: e.target.value as Category })}
                    aria-label="Category"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CAT_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputCls + " !h-11 !w-14 shrink-0 text-center"}
                    inputMode="numeric"
                    value={it.qty}
                    onChange={(e) => update(it.key, { qty: e.target.value.replace(/[^0-9]/g, "") })}
                    aria-label="Quantity"
                  />
                  <span className="text-stone-400">×</span>
                  <input
                    className={inputCls + " !h-11 w-full text-right"}
                    inputMode="decimal"
                    value={it.price}
                    onChange={(e) => update(it.key, { price: e.target.value })}
                    placeholder="฿"
                    aria-label="Unit price in baht"
                  />
                </div>
                {Number.isFinite(line) && line > 0 && Number(it.qty) > 1 && (
                  <p className="mt-1 text-right text-xs text-stone-500 tabular-nums">= {formatTHB(Math.round(line * 100))}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          className={secondaryCls}
          onClick={() => onChange([...items, { key: newKey(), name: "", category: "food", qty: "1", price: "" }])}
        >
          + Add item
        </button>
        <p className="text-sm text-stone-600">
          {items.length} items · <span className="font-semibold tabular-nums">{formatTHB(draftTotalSatang(items))}</span>
        </p>
      </div>
    </div>
  );
}
