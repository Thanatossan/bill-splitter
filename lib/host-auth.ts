import { createHash, timingSafeEqual } from "crypto";
import { error } from "./server";
import { store } from "./store";

const MAX_FAILURES = 10;
const WINDOW_SEC = 15 * 60;

/** Locally, no passcode is needed unless HOST_PASSCODE is set. On Vercel it's required. */
export const passcodeRequired = () => Boolean(process.env.HOST_PASSCODE) || Boolean(process.env.VERCEL);

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const digest = (s: string) => createHash("sha256").update(s).digest();

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

/**
 * Returns an error Response if the request may not act as the host, else null.
 * Failed attempts are rate-limited per IP to stop passcode guessing.
 */
export async function requireHost(req: Request, passcode: unknown): Promise<Response | null> {
  if (!passcodeRequired()) return null;
  const expected = process.env.HOST_PASSCODE;
  if (!expected) return error("Creating bills is disabled until HOST_PASSCODE is set in Vercel.", 503);

  const key = `rl:passcode:${clientIp(req)}`;
  if ((await store.count(key)) >= MAX_FAILURES)
    return error("Too many wrong passcodes. Try again in 15 minutes.", 429);

  const given = typeof passcode === "string" ? passcode : "";
  if (given && timingSafeEqual(digest(given), digest(expected))) return null;
  await store.bump(key, WINDOW_SEC);
  return error("Wrong passcode", 401);
}
