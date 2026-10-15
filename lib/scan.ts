import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const ReceiptSchema = z.object({
  restaurant_name: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.number(),
      unit_price: z.number(),
      category: z.enum(["food", "drinks", "alcohol", "water"]),
    }),
  ),
  service_charge_percent: z.number(),
  prices_include_vat: z.boolean(),
  receipt_total: z.number().nullable(),
  notes: z.string(),
});

export type ScannedReceipt = z.infer<typeof ReceiptSchema>;

const SYSTEM = `You read restaurant receipts (often Thai, in Thai and/or English) so a group of friends can split the bill.

Extract every purchased line item:
- name: as printed on the receipt; keep Thai text as Thai.
- qty: number of units.
- unit_price: price of ONE unit in THB. If the receipt shows a line amount for several units, divide it by the quantity.
- category: food, drinks (non-alcoholic), alcohol (beer, wine, cocktails, spirits), or water (plain/mineral/sparkling water).
If the same item appears on several lines at the same unit price, merge them into one item with the summed qty.

Do NOT list subtotal, service charge, VAT, rounding, discounts, or payment lines as items.

Also report:
- service_charge_percent: the service charge rate as a percent (e.g. 10), or 0 if there is none.
- prices_include_vat: true if item prices already include VAT (VAT is only shown as an "included" breakdown, or the total equals items plus service charge); false if VAT is added on top as an extra line that increases the total.
- receipt_total: the final amount to pay in THB, or null if you can't read it.
- notes: anything the host should double-check (unreadable lines, discounts, items you weren't sure about). Empty string if nothing.`;

export class ScanError extends Error {}

/**
 * Sonnet 5.5 by default: close to Opus on printed receipts at about half the
 * price. Override with SCAN_MODEL (e.g. claude-haiku-5-5 for the cheapest).
 */
const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"] as const;
const scanModel = () => MODELS.find((m) => m === process.env.SCAN_MODEL) ?? "claude-sonnet-5-5";

/** Read a receipt photo with Claude and return structured line items. */
export async function scanReceipt(jpegBase64: string): Promise<ScannedReceipt> {
  const client = new Anthropic();
  const model = scanModel();
  // Server-side refusal fallback isn't offered for Haiku; receipts rarely trip it anyway.
  const fallback = model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      ...fallback,
      output_config: { effort: "medium", format: betaZodOutputFormat(ReceiptSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpegBase64 } },
            { type: "text", text: "Extract the items from this receipt." },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ScanError("The Anthropic API key is invalid.");
    if (e instanceof Anthropic.RateLimitError) throw new ScanError("Too many scans right now. Try again in a minute.");
    if (e instanceof Anthropic.BadRequestError) throw new ScanError("Claude couldn't read that image. Try a clearer photo.");
    if (e instanceof Anthropic.APIError) throw new ScanError(`Scan failed (${e.status ?? "network"}). Try again.`);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new ScanError("Claude declined to read this image.");
  if (response.stop_reason === "max_tokens" || !response.parsed_output)
    throw new ScanError("Couldn't read the receipt. Try a clearer photo, or paste the items as text.");
  return response.parsed_output;
}
