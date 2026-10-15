/**
 * Create the Table A1 bill and print its share + admin links.
 *   npm run seed                      # local JSON store (.data/db.json)
 *   APP_URL=https://x.vercel.app npm run seed   # with Upstash env vars set
 */
import { createBill } from "../lib/server";
import { usingRedis } from "../lib/store";
import { itemsTotal, formatTHB } from "../lib/money";

async function main() {
  const bill = await createBill();
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log(`Store:      ${usingRedis ? "Upstash Redis" : "local file .data/db.json"}`);
  console.log(`Items:      ${bill.items.length} lines, total ${formatTHB(itemsTotal(bill.items))}`);
  console.log(`Share link: ${base}/b/${bill.id}`);
  console.log(`Admin link: ${base}/admin/${bill.adminToken}   (keep this secret)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
