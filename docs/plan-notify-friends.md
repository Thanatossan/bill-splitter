# Plan: tell friends the bill is ready

Goal: when the host locks a bill, each friend hears about it and how much they owe. Two ways, built in this order:

1. **One-tap buttons** (free, works everywhere): per-friend SMS / Instagram / Messenger / Share buttons that open the host's own apps with a message ready to send.
2. **Automatic SMS via Twilio** (about ฿1 per SMS, so ฿8–16 per bill): one button texts everyone their amount.

Both use the same contact details and the same message builder, so phase 2 adds no extra setup for the host.

> **Wait before coding.** At the time of writing, another session has uncommitted changes in `app/admin/[token]/AdminApp.tsx`, `app/api/admin/[token]/route.ts`, `app/b/[shareId]/FriendApp.tsx`, `lib/types.ts`, `lib/store.ts` and `lib/host-storage.ts`, which are the files this plan touches. Start only after that work is committed.

---

## Key decisions

- **Contact details never go into `Bill`.** `loadPayload()` in `lib/server.ts` sends the whole bill (minus `adminToken`) to anyone with the share link, including the roster. Phone numbers and usernames are stored under a separate key that only the admin API reads, so leaking them would take a deliberate change, not an accidental field.
- **Only the server computes amounts for SMS.** The notify action runs `computeBill` itself. It never trusts amounts sent by the client.
- **Automatic sending happens only on an explicit tap, never on lock.** Lock can be toggled on and off, and every SMS costs money. After locking, the host sees "Text 8 friends (~฿9)?" and confirms.
- **No Twilio SDK.** One `fetch` to Twilio's REST API is enough, which keeps dependencies small. A provider interface makes switching to ThaiBulkSMS a one-file change (see "Twilio in Thailand" below).

## Data

`lib/types.ts`
```ts
export interface Contact { phone?: string; instagram?: string; facebook?: string }
export interface NotifyLog { at: number; status: "sent" | "failed"; error?: string }
```

`lib/store.ts`: two new hashes, so each friend's record saves on its own and concurrent saves don't overwrite each other:

| Key | Value |
| --- | --- |
| `bill:{id}:contacts` | hash `guestId → Contact` |
| `bill:{id}:notified` | hash `guestId → NotifyLog` (automatic SMS only) |

New `Store` methods: `getContacts`, `putContact`, `getNotified`, `putNotified`. The file store gets `contacts` and `notified` maps in `FileDB`.

`lib/host-storage.ts`: add `contacts: Record<lowercaseName, Contact>` to `HostProfile`. This lives only on the host's phone, so the next bill can pre-fill numbers for friends already on it.

## New pure helpers (unit-tested)

- `lib/phone.ts`: `normalizeThaiPhone("081-234-5678") → "+66812345678"`. Accepts `0…`, `66…`, `+66…`, spaces and dashes. Rejects numbers that aren't mobile (it should be 9 digits after 66, starting with 6, 8 or 9).
- `lib/notify.ts`
  - `notifyText({ title, name, amountSatang, url, host })` builds the message. The default is ASCII only: `"Table A1 is final. Ann owes THB 1,240. Pay: https://…/b/abc?me=guest-03"`, which fits in one SMS segment of 160 characters.
  - `smsSegments(text)` counts segments: GSM-7 is 160 per segment (153 when split), UCS-2 is 70 (67 when split). A Thai name, `฿` or an emoji switches the message to UCS-2, which roughly doubles the cost. The UI shows the segment count and estimated cost before sending.
  - `pickRecipients(roster, contacts, notified, explicitIds?)` decides who gets a text: guests with a phone number who haven't been texted yet, unless the host taps Resend for specific people.

Tests go in `tests/notify.test.ts`: phone formats, segment boundaries (160/161, 70/71, mixed Thai), and recipient selection (skip already sent, resend, skip guests without a phone).

## Phase 1: contacts and one-tap buttons

**Admin API** (`app/api/admin/[token]/route.ts`)
- New action `setContact { guestId, phone?, instagram?, facebook? }`, validated with `normalizeThaiPhone`. Usernames are trimmed and stripped of any leading `@`.
- `adminPayload()` also returns `contacts`, `notified` and `smsEnabled`.

**Admin UI** (`AdminApp.tsx`)
- In the guest list: a small "Contact" edit for each guest (phone, IG, FB). Fields pre-fill from the host profile, and saving updates the profile too.
- In the people list, once the bill is locked, each row shows buttons for the contact details that friend has:
  - **SMS**: `sms:+66812345678?&body=<encoded>`. The `?&` form works on both iOS and Android.
  - **IG**: copy the message (reuse `copyText` from `lib/client.ts`), show "Copied, paste it in the chat", then open `https://ig.me/m/<username>`.
  - **Messenger**: the same, with `https://m.me/<username>`.
  - **Share**: `navigator.share({ text })` when it's available, otherwise copy.
- Each friend's message uses their own rounded amount from `result.people`.

**Friend page** (`FriendApp.tsx`)
- `?me=<guestId>` pre-selects that guest when this phone has no saved choice, so the link opens straight to the friend's own total.
- When the bill is locked: a prominent "Final: you owe ฿X" banner with the PromptPay QR near the top, and the browser tab title changes to `✅ Pay ฿X`.

## Phase 2: automatic SMS with Twilio

**`lib/sms.ts`**
```ts
export const smsEnabled = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && sender());
export async function sendSms(to: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string }>
```
- `POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`, with Basic auth and a form body containing `To`, `Body`, and `MessagingServiceSid` (or `From`).
- Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (preferred) or `TWILIO_FROM`.

**Admin API**: new action `notify { guestIds?: string[] }`
1. Refuse if SMS isn't configured or the bill isn't locked.
2. Compute amounts with `computeBill`, then choose recipients with `pickRecipients`.
3. Cap spend with `store.bump("rl:sms:{billId}", 86400)`, for example at most 3 × the roster size per day.
4. Send with `Promise.allSettled`, about 10 requests. Send them synchronously rather than in `after()` so the host sees each friend's result.
5. Save a `NotifyLog` for each friend and return the payload.

**Admin UI**
- After locking: a "📱 Text everyone (N people · ~฿X)" button with a confirm step. It's hidden unless `smsEnabled`.
- Each row shows "✓ Texted 20:14", or "Failed: retry" with the error message.

**Docs**: in the README, add the env vars and an "SMS" section covering the Twilio setup below.

## Twilio in Thailand: setup and blockers (start early)

From [Twilio's Thailand guidelines](https://www.twilio.com/en-us/guidelines/th/sms):
- **The sender name must be registered.** Twilio said it would block unregistered sender names completely from 6 October 2025. Numeric senders are delivered "best effort" and may be replaced with a random one.
- **Links in SMS need separate approval.** Email `senderid@twilio.com` with the full URL. **Short links are prohibited.** Thailand's telecom regulator (NBTC) requires the company name, company registration number, business type and a Letter of Authorisation ([Twilio support article](https://support.twilio.com/hc/en-us/articles/5142014273307-Documents-Required-and-Instructions-to-Register-Your-Alphanumeric-Sender-ID-in-Thailand)). **This may block someone without a registered company.** Approval reportedly takes about 2 weeks.
- A trial account can text only verified numbers and adds a "Sent from your Twilio trial account" prefix. The account has to be upgraded before friends get clean messages.
- The approved link should be on a stable domain. A custom domain is better than a `*.vercel.app` URL that might change.

Fallbacks if link approval isn't possible:
- **SMS without a link**: "Table A1 is final. Ann owes THB 1,240. Open the bill link from Siva." The sender name still needs registering.
- **ThaiBulkSMS**: says registering a sender name needs no documents. Ask them whether links are allowed for personal use. If so, switching means only another `sendSms` implementation.

## Build order

1. Wait until the other session's changes are committed.
2. Helpers and tests: `lib/phone.ts`, `lib/notify.ts`, `tests/notify.test.ts`.
3. Store and types: contacts and notified hashes.
4. Phase 1 API and UI: `setContact`, contact editor, one-tap buttons, `?me=`, friend "ready" banner.
5. Check on a phone: SMS opens with the text filled in on iOS and Android, IG and Messenger open the right chat, and the share link never contains anyone's contact details (inspect `GET /api/b/{id}`).
6. Phase 2: `lib/sms.ts`, the `notify` action, the UI, and the README. Test with a Twilio trial account and your own verified number first.
7. Meanwhile (host task): open a Twilio account and start sender name and link registration, because it has a long lead time.
