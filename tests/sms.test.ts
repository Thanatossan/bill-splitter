import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSms, smsEnabled, smsLinkBase } from "../lib/sms";

describe("sms", () => {
  beforeEach(() => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "secret");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG456");
    vi.stubEnv("TWILIO_FROM", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is disabled without credentials or a sender", () => {
    expect(smsEnabled()).toBe(true);
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "");
    expect(smsEnabled()).toBe(false);
    vi.stubEnv("TWILIO_FROM", "SplitBill");
    expect(smsEnabled()).toBe(true);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect(smsEnabled()).toBe(false);
  });

  it("posts a form to Twilio with basic auth", async () => {
    const fetchMock = vi.fn(async () => Response.json({ sid: "SM789" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendSms("+66812345678", "Hi")).toEqual({ ok: true, id: "SM789" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect((init.headers as Record<string, string>).Authorization).toBe("Basic " + btoa("AC123:secret"));
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(Object.fromEntries(body)).toEqual({ To: "+66812345678", Body: "Hi", MessagingServiceSid: "MG456" });
  });

  it("uses From when there's no messaging service", async () => {
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "");
    vi.stubEnv("TWILIO_FROM", "SplitBill");
    const fetchMock = vi.fn(async () => Response.json({ sid: "SM1" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendSms("+66812345678", "Hi");
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new URLSearchParams(init.body as URLSearchParams).get("From")).toBe("SplitBill");
  });

  it("returns Twilio's error message", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ code: 21211, message: "The 'To' number is not a valid phone number." }, { status: 400 }),
    );
    expect(await sendSms("+66812345678", "Hi")).toEqual({
      ok: false,
      error: "The 'To' number is not a valid phone number. (21211)",
    });
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("fetch failed");
    });
    expect(await sendSms("+66812345678", "Hi")).toEqual({ ok: false, error: "fetch failed" });
  });

  it("picks the link base from env, or none", () => {
    expect(smsLinkBase("http://localhost:3000")).toBe("http://localhost:3000");
    vi.stubEnv("SMS_LINK_BASE_URL", "https://split.example");
    expect(smsLinkBase("http://localhost:3000")).toBe("https://split.example");
    vi.stubEnv("SMS_LINKS", "off");
    expect(smsLinkBase("http://localhost:3000")).toBeNull();
  });
});
