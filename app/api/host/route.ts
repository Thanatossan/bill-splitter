import { aiEnabled, passcodeRequired, requireHost } from "@/lib/host-auth";
import { json, readJson } from "@/lib/server";

/** What the "New bill" page needs to know before showing its form. */
export async function GET() {
  return json({ passcodeRequired: passcodeRequired(), aiEnabled: aiEnabled() });
}

/** Check a passcode without creating anything. */
export async function POST(req: Request) {
  const body = await readJson<{ passcode: string }>(req);
  return (await requireHost(req, body.passcode)) ?? json({ ok: true });
}
