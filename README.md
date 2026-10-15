# Split the bill

A mobile-first web app for splitting a restaurant bill. Share one link; each friend enters their name, ticks the units they had, and sees what they owe, with a PromptPay QR for their exact amount.

- **Friends**: `/b/<shareId>`. No login. They tap their name on the guest list (or type one if they're missing), and the choice is remembered in `localStorage`, so they can come back and edit.
- **Host**: `/admin/<adminToken>`. A secret link with a per-person table, paid toggles, unclaimed units, a live total check, payment details, manual items, tip/extra, and a lock.

Built with Next.js 16 (App Router), TypeScript, Tailwind v4, and Upstash Redis (the Vercel Marketplace successor to Vercel KV).

## Money rules

All math is in integer **satang** (`lib/money.ts`) and covered by tests (`tests/money.test.ts`).

- Prices already include 7% VAT, so no tax is ever added.
- A unit ticked by N people is split evenly. Leftover satang go to whoever has absorbed the fewest so far, so each unit sums exactly and nobody collects more than about 1 satang of rounding.
- Items marked **shared by everyone** (e.g. water) are split among everyone who has saved.
- **Tip/extra** is split in proportion to each person's subtotal, using largest-remainder so it sums exactly.
- Each person **pays their total rounded up to the whole baht**, and the UI says so. The host view shows the surplus.
- Every satang is accounted for: the host view checks `sum of shares + unclaimed = items + extra`.

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
lib/money.ts          pure money math (split, allocate, round, computeBill)
lib/seed-data.ts      Table A1 receipt (sums to 945,900 satang)
lib/store.ts          Upstash Redis store, falls back to .data/db.json locally
lib/server.ts         create bill, payload helpers, input parsing
lib/i18n.tsx          EN / TH strings + toggle
lib/client.ts         polling hook, safe localStorage, clipboard fallback
components/ui.tsx     avatars, PromptPay QR, switch, checkbox, copy button
app/b/[shareId]/      friend page
app/admin/[token]/    host page
app/api/...           route handlers
scripts/seed.ts       creates the bill and prints both links
tests/money.test.ts   vitest
```

## Local development

```bash
npm install
npm test            # money-math tests
npm run seed        # creates the Table A1 bill, prints share + admin links
npm run dev         # http://localhost:3000
```

Without Redis env vars, data is stored in `.data/db.json`, so no setup is needed.

## Environment variables

| Var | Notes |
| --- | --- |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Set automatically when you add **Upstash for Redis** from the Vercel Marketplace |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Alternative names if you create the DB on upstash.com directly |
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
