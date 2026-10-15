# Split the bill

A mobile-first web app for splitting a restaurant bill. You create a bill, send one link to the group (there's a LINE button), and each friend taps their name, ticks what they had, and sees what they owe, with a PromptPay QR for their exact amount.

- **Host**: `/new` creates a bill:
  - party name, date, emoji and accent color
  - guest list, with friends from past parties suggested
  - receipt items, from a photo scanned by Claude or pasted as text
  - service charge and VAT
  - your PromptPay or bank details

  Creating a bill needs the host passcode. Your payment details, friends and past bills (under **My bills** on `/`) are remembered on your phone.
- **Admin**: `/admin/<adminToken>`. A secret link where you can:
  - see who owes what and toggle paid/unpaid
  - see unclaimed items and a live check against the receipt
  - edit everything: items, charges, tip, theme, guest list, payment details
  - lock the bill
- **Friends**: `/b/<shareId>`. No login. They tap their name, and the choice is remembered on their phone so they can come back and edit.

Built with Next.js 16 (App Router), TypeScript, Tailwind v4, Upstash Redis (the Vercel Marketplace successor to Vercel KV), and the Claude API for receipt scanning.

## Money rules

All math is in integer **satang** (`lib/money.ts`) and covered by tests (`tests/money.test.ts`).

- Prices already include 7% VAT, so no tax is ever added.
- A unit ticked by N people is split evenly. Leftover satang go to whoever has absorbed the fewest so far, so each unit sums exactly and nobody collects more than about 1 satang of rounding.
- Items marked **shared by everyone** (e.g. water) are split among everyone who has saved.
- **Service charge and VAT** (when the receipt adds them on top) are applied Thai-style: service on the items, then VAT on items + service, each rounded once at bill level. They're split in proportion to what each person ordered, so nobody pays service on items nobody claimed.
- **Tip/extra** is split in proportion to each person's subtotal, using largest-remainder so it sums exactly.
- Each person **pays their total rounded up to the whole baht**, and the UI says so. The host view shows the surplus.
- Every satang is accounted for: once nothing is unclaimed, the sum of everyone's shares equals items + service + VAT + tip exactly. The host view shows any shortfall.

## Data model

| Key | Value |
| --- | --- |
| `bill:{shareId}` | `Bill` – title, date, receipt total, items, extra, lock, payment info, admin token |
| `bill:{shareId}:people` | Redis hash `personId → Person {name, unitIds[], paid}`. One field per friend, so concurrent saves never clobber each other. |
| `admin:{token}` | `shareId` |

Bills also carry a **guest list** (`roster`: `{id, name}[]`; ids are `guest-01`, `guest-02`, …). A guest's saved `Person` uses the same id, so picking a name on two phones edits the same record. "Shared by everyone" items are split across the whole guest list, including people who haven't picked yet. The guest list for Table A1 is in `lib/seed-data.ts`, and the host can add or remove names from the admin page.

Units are not stored. Item `chicken-wings` with qty 2 becomes units `chicken-wings#1` and `chicken-wings#2`.

## Files

```
lib/money.ts             pure money math (splits, service/VAT, tip, rounding)
lib/receipt.ts           paste-text receipt parser + category guessing
lib/scan.ts              receipt photo → items with Claude (structured output)
lib/validate.ts          server-side checks for bills, items, guests, settings
lib/host-auth.ts         host passcode + rate limiting
lib/store.ts             Upstash Redis store, falls back to .data/db.json locally
lib/host-storage.ts      host's saved details + "My bills" (localStorage)
lib/theme.ts             accent colors
lib/i18n.tsx             EN / TH strings for friends
components/host/         New-bill / admin form pieces and the items editor
app/page.tsx             home: New bill + My bills
app/new/                 create a bill
app/admin/[token]/       host page
app/b/[shareId]/         friend page
app/api/...              route handlers (bills, scan, host, admin, friends)
scripts/seed.ts          optional Table A1 sample bill
tests/                   vitest (money + receipt parser)
```

## Local development

```bash
npm install
npm test            # money-math tests
npm run dev         # http://localhost:3000 → "New bill"
npm run seed        # optional: creates the Table A1 sample bill
```

Without Redis env vars, data is stored in `.data/db.json`, so no setup is needed.

## Environment variables

| Var | Notes |
| --- | --- |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Set automatically when you add **Upstash for Redis** from the Vercel Marketplace |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Alternative names if you create the DB on upstash.com directly |
| `HOST_PASSCODE` | Required on Vercel to create bills at `/new` (locally it's optional). 10 wrong tries per IP locks that IP out for 15 minutes. |
| `ANTHROPIC_API_KEY` | Optional. Turns on "Scan receipt photo". Without it, hosts paste or type items (or copy text from the photo with iPhone Live Text / Google Lens and paste it). |
| `SCAN_MODEL` | Optional. `claude-sonnet-5-5` (default, ~2–3¢ per scan), `claude-haiku-5-5` (~0.1–0.2¢, fine for clean receipts) or `claude-opus-5-5` (~5¢, best on hard photos). |
| `USE_REDIS` | Set to `1` to make `npm run dev` use Redis. By default dev uses `.data/db.json`, even though `vercel env pull` puts production Redis credentials in `.env.local`. |
| `APP_URL` | Optional, only used by `npm run seed` to print full links |

## Deploy to Vercel

1. Push this folder to a GitHub repo and import it in Vercel (framework: Next.js; defaults are fine).
2. In the project, go to **Storage → Marketplace → Upstash for Redis → Create** and connect it to the project. This adds the `KV_REST_API_*` env vars.
3. Deploy.
4. Create the bill against the production database from your machine:
   ```bash
   npx vercel link
   npx vercel env pull .env.local
   set -a; source .env.local; set +a
   APP_URL=https://your-app.vercel.app npm run seed
   ```
5. Open the **admin link** and add your PromptPay number and/or bank details, then send the **share link** to the group (for example in LINE).
6. When everyone has picked and nothing is unclaimed, **lock** the bill and toggle people to paid as transfers arrive.

> The deployed app refuses to start without Redis, because Vercel's filesystem is read-only. That's intentional.

## Notes

- Updates are by polling (friends every 4s, host every 5s, paused while the tab is hidden).
- Anyone with the share link can toggle "shared by everyone" on water (it applies to everyone) until the bill is locked. The host can toggle it for any item.
- Picking a name is trust-based (no login): anyone with the link can pick any name. That's fine among friends; the host can see every change.
- To split a different receipt, edit `lib/seed-data.ts` and run `npm run seed` again. Each run creates a new bill with new links.
