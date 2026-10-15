import { error, json, loadPayload } from "@/lib/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/b/[shareId]">) {
  const { shareId } = await ctx.params;
  const payload = await loadPayload(shareId);
  return payload ? json(payload) : error("Bill not found", 404);
}
