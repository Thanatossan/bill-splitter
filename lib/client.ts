"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** localStorage that never throws (private mode, LINE in-app browser quirks). */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  },
};

export function newId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fetch JSON now and every `intervalMs` while the tab is visible. */
export function usePolling<T>(url: string, intervalMs = 4000) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 404) setStatus("notfound");
      else if (res.ok) {
        setData(await res.json());
        setStatus("ok");
      }
    } catch {
      setStatus((s) => (s === "loading" ? "error" : s));
    } finally {
      inflight.current = false;
    }
  }, [url]);

  useEffect(() => {
    // State is only set after the fetch resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);

  return { data, setData, status, refresh };
}

export async function sendJson<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Clipboard API with a fallback for in-app browsers that block it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function graphemes(s: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter("th", { granularity: "grapheme" }).segment(s), (x) => x.segment);
  }
  return Array.from(s);
}

export function initials(name: string) {
  const trimmed = name.trim();
  if (/[\u0E00-\u0E7F]/.test(trimmed)) {
    // Thai: skip leading vowels (เ แ โ ใ ไ) and show two clusters, so
    // ไนซ์ / ไบร์ท / ไอซ์ don't all become "ไ" (→ นซ์ / บร์ / อซ์).
    return graphemes(trimmed.replace(/^[\u0E40-\u0E44]/, "")).slice(0, 2).join("");
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0], parts[1]] : [parts[0] ?? "?"];
  return chars.map((p) => Array.from(p)[0]?.toUpperCase() ?? "").join("").slice(0, 2);
}

const PALETTE = [
  "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-lime-600", "bg-emerald-500",
  "bg-teal-500", "bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-fuchsia-500",
  "bg-pink-500", "bg-cyan-600",
];

export function colorFor(id: string) {
  // Guest-list ids are sequential, so the 12 guests get 12 different colors.
  const guest = /^guest-(\d+)$/.exec(id);
  if (guest) return PALETTE[(Number(guest[1]) - 1) % PALETTE.length];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
