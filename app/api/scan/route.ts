import { aiEnabled, requireHost } from "@/lib/host-auth";
import { ScanError, scanReceipt } from "@/lib/scan";
import { billForAdmin, error, json, readJson } from "@/lib/server";

export const maxDuration = 60;

/** The host scans a receipt photo (a resized JPEG as base64) into draft items. */
export async function POST(req: Request) {
  if (!aiEnabled()) return error("Receipt scanning isn't set up (ANTHROPIC_API_KEY is missing).", 503);
  const body = await readJson<{ passcode: string; adminToken: string; image: string }>(req);
  // From a bill's admin page the admin token is proof enough; otherwise the passcode.
  const isAdmin = typeof body.adminToken === "string" && (await billForAdmin(body.adminToken)) !== null;
  const denied = isAdmin ? null : await requireHost(req, body.passcode);
  if (denied) return denied;

  const image = typeof body.image === "string" ? body.image.replace(/^data:image\/jpeg;base64,/, "") : "";
  if (!image || image.length > 4_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image))
    return error("Send the photo as a JPEG under 3 MB", 400);

  try {
    return json(await scanReceipt(image));
  } catch (e) {
    if (e instanceof ScanError) return error(e.message, 502);
    throw e;
  }
}
