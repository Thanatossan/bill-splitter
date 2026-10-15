"use client";

import { useState } from "react";
import { copyText } from "@/lib/client";
import { formatTHB } from "@/lib/money";
import { displayThaiPhone } from "@/lib/phone";
import type { Contact, NotifyLog } from "@/lib/types";
import { primaryCls, secondaryCls } from "@/components/host/form";

const chipCls =
  "inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white active:opacity-80";

/**
 * One-tap ways to send a friend their amount from the host's own phone:
 * Messages with the text filled in, or the share sheet (LINE, IG, …).
 */
export function NotifyButtons({
  contact,
  text,
  onNotice,
}: {
  contact: Contact;
  text: string;
  onNotice: (msg: string) => void;
}) {
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="flex flex-wrap gap-1.5">
      {/* `?&body=` works on both iOS and Android. */}
      <a href={`sms:${contact.phone}?&body=${encodeURIComponent(text)}`} className={`${chipCls} bg-sky-600`}>
        💬 SMS {displayThaiPhone(contact.phone)}
      </a>
      <button
        type="button"
        className="inline-flex h-9 items-center rounded-full bg-stone-200 px-3 text-sm font-semibold text-stone-700 active:bg-stone-300"
        onClick={async () => {
          if (canShare) {
            try {
              await navigator.share({ text });
              return;
            } catch (e) {
              // The user closed the share sheet: nothing to do.
              if (e instanceof DOMException && e.name === "AbortError") return;
            }
          }
          if (await copyText(text)) onNotice("Message copied.");
        }}
      >
        {canShare ? "Share…" : "Copy"}
      </button>
    </div>
  );
}

const time = (at: number) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Result of the last automatic SMS, with resend / retry. */
export function SmsStatus({ log, busy, onResend }: { log?: NotifyLog; busy: boolean; onResend: () => void }) {
  if (!log) return null;
  if (log.status === "sent") {
    return (
      <p className="text-xs text-accent-ink">
        ✓ Texted {time(log.at)} ·{" "}
        <button type="button" disabled={busy} className="underline" onClick={() => confirm("Text them again?") && onResend()}>
          Resend
        </button>
      </p>
    );
  }
  return (
    <p className="text-xs text-rose-700">
      Text failed{log.error ? `: ${log.error}` : ""} ·{" "}
      <button type="button" disabled={busy} className="font-semibold underline" onClick={onResend}>
        Retry
      </button>
    </p>
  );
}

/** "Text everyone" with a confirm step, since every message costs money. */
export function TextEveryone({
  count,
  costSatang,
  maxSegments,
  linkless,
  busy,
  onSend,
}: {
  count: number;
  costSatang: number;
  maxSegments: number;
  linkless: boolean;
  busy: boolean;
  onSend: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  if (count === 0) {
    return <p className="text-sm text-stone-500">📱 Everyone with a phone number has been texted.</p>;
  }
  const label = `${count} ${count === 1 ? "person" : "people"} · ~${formatTHB(Math.max(1, Math.ceil(costSatang / 100)) * 100)}`;
  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
          <p className="font-semibold text-sky-900">Text {label}?</p>
          <p className="mt-0.5 text-xs text-sky-800">
            Each friend gets their own amount{linkless ? "" : " and link"}. Texts can&apos;t be unsent.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={primaryCls + " flex-1"}
              disabled={busy}
              onClick={async () => {
                await onSend();
                setConfirming(false);
              }}
            >
              {busy ? "Sending…" : "Send texts"}
            </button>
            <button type="button" className={secondaryCls + " !h-12"} disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={primaryCls + " w-full"} disabled={busy} onClick={() => setConfirming(true)}>
          📱 Text everyone ({label})
        </button>
      )}
      {maxSegments > 1 && (
        <p className="text-xs text-stone-500">
          Some texts are {maxSegments} SMS long (Thai letters or a long title cost more), so the estimate includes that.
        </p>
      )}
    </div>
  );
}
