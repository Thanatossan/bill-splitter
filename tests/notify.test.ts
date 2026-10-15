import { describe, expect, it } from "vitest";
import { displayThaiPhone, normalizeThaiPhone } from "../lib/phone";
import { asciiTHB, friendUrl, notifyText, pickRecipients, smsSegments } from "../lib/notify";
import { parseContact } from "../lib/validate";
import type { Contact, Guest, NotifyLog } from "../lib/types";

describe("normalizeThaiPhone", () => {
  it.each([
    ["0812345678", "+66812345678"],
    ["081-234-5678", "+66812345678"],
    ["081 234 5678", "+66812345678"],
    ["(081) 234.5678", "+66812345678"],
    ["66812345678", "+66812345678"],
    ["+66812345678", "+66812345678"],
    ["+66 81 234 5678", "+66812345678"],
    ["+66 0812345678", "+66812345678"],
    ["0612345678", "+66612345678"],
    ["0912345678", "+66912345678"],
  ])("%s → %s", (raw, want) => {
    expect(normalizeThaiPhone(raw)).toBe(want);
  });

  it.each([
    "",
    "021234567", // Bangkok landline
    "0212345678", // landline, 10 digits
    "0712345678", // not a mobile prefix
    "081234567", // too short
    "08123456789", // too long
    "+1 415 555 0100",
    "08x2345678",
  ])("rejects %j", (raw) => {
    expect(normalizeThaiPhone(raw)).toBeNull();
  });

  it("formats for display", () => {
    expect(displayThaiPhone("+66812345678")).toBe("081-234-5678");
  });
});

describe("notifyText", () => {
  const base = { title: "Table A1", name: "Ann", amountSatang: 124000 };

  it("includes the friend's own link", () => {
    const url = friendUrl("https://split.example/", "abc", "guest-03");
    expect(url).toBe("https://split.example/b/abc?me=guest-03");
    const text = notifyText({ ...base, url });
    expect(text).toBe("Table A1 is final. Ann owes THB 1,240. Pay: https://split.example/b/abc?me=guest-03");
    expect(smsSegments(text)).toMatchObject({ encoding: "GSM-7", segments: 1 });
  });

  it("works without a link", () => {
    expect(notifyText({ ...base, host: "Siva" })).toBe("Table A1 is final. Ann owes THB 1,240. Open the bill link from Siva.");
    expect(notifyText(base)).toMatch(/from the group chat\.$/);
  });

  it("formats amounts in ASCII", () => {
    expect(asciiTHB(124000)).toBe("THB 1,240");
    expect(asciiTHB(12350)).toBe("THB 123.50");
  });
});

describe("smsSegments", () => {
  it("counts GSM-7 boundaries at 160 / 161", () => {
    expect(smsSegments("")).toEqual({ encoding: "GSM-7", length: 0, segments: 0 });
    expect(smsSegments("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(smsSegments("a".repeat(161))).toMatchObject({ segments: 2 });
    expect(smsSegments("a".repeat(306))).toMatchObject({ segments: 2 });
    expect(smsSegments("a".repeat(307))).toMatchObject({ segments: 3 });
  });

  it("counts extension characters twice", () => {
    expect(smsSegments("€".repeat(80))).toMatchObject({ encoding: "GSM-7", length: 160, segments: 1 });
    expect(smsSegments("a" + "€".repeat(80))).toMatchObject({ length: 161, segments: 2 });
  });

  it("counts UCS-2 boundaries at 70 / 71", () => {
    expect(smsSegments("ก".repeat(70))).toMatchObject({ encoding: "UCS-2", segments: 1 });
    expect(smsSegments("ก".repeat(71))).toMatchObject({ encoding: "UCS-2", segments: 2 });
    expect(smsSegments("ก".repeat(134))).toMatchObject({ segments: 2 });
    expect(smsSegments("ก".repeat(135))).toMatchObject({ segments: 3 });
  });

  it("switches the whole message to UCS-2 for one Thai letter, ฿ or emoji", () => {
    const text = notifyText({ title: "Table A1", name: "แอน", amountSatang: 124000, url: "https://split.example/b/abc?me=guest-03" });
    expect(smsSegments(text)).toMatchObject({ encoding: "UCS-2", segments: 2 });
    expect(smsSegments("Pay ฿100")).toMatchObject({ encoding: "UCS-2", segments: 1 });
    // An emoji is two UTF-16 units.
    expect(smsSegments("a".repeat(68) + "✅")).toMatchObject({ length: 69, segments: 1 });
    expect(smsSegments("a".repeat(68) + "🎉")).toMatchObject({ length: 70, segments: 1 });
    expect(smsSegments("a".repeat(69) + "🎉")).toMatchObject({ length: 71, segments: 2 });
  });
});

describe("pickRecipients", () => {
  const roster: Guest[] = [
    { id: "guest-01", name: "Ann" },
    { id: "guest-02", name: "Ben" },
    { id: "guest-03", name: "Cat" },
    { id: "guest-04", name: "Dan" },
  ];
  const contacts: Record<string, Contact> = {
    "guest-01": { phone: "+66811111111" },
    "guest-02": { phone: "+66822222222" },
    // guest-03 left no number
    "guest-04": { phone: "+66844444444" },
  };
  const notified: Record<string, NotifyLog> = {
    "guest-01": { at: 1, status: "sent" },
    "guest-04": { at: 1, status: "failed", error: "Invalid number" },
  };
  const ids = (r: { id: string }[]) => r.map((x) => x.id);

  it("texts guests with a phone who haven't been texted yet (failed counts as not texted)", () => {
    expect(ids(pickRecipients(roster, contacts, notified))).toEqual(["guest-02", "guest-04"]);
    expect(pickRecipients(roster, contacts, notified)[0]).toEqual({ id: "guest-02", name: "Ben", phone: "+66822222222" });
  });

  it("resends to exactly the chosen guests, even if already sent", () => {
    expect(ids(pickRecipients(roster, contacts, notified, { only: ["guest-01", "guest-03"] }))).toEqual(["guest-01"]);
  });

  it("skips guests who owe nothing", () => {
    const owed = { "guest-01": 1000, "guest-02": 0, "guest-04": 50000 };
    expect(ids(pickRecipients(roster, contacts, {}, { owed }))).toEqual(["guest-01", "guest-04"]);
  });

  it("returns nobody when there are no contacts", () => {
    expect(pickRecipients(roster, {}, {})).toEqual([]);
  });
});

describe("parseContact", () => {
  it("normalizes the phone", () => {
    expect(parseContact({ phone: " 081-234-5678 " })).toEqual({ phone: "+66812345678" });
  });

  it("treats an empty number as removing it", () => {
    expect(parseContact({ phone: " " })).toBeNull();
    expect(parseContact({})).toBeNull();
  });

  it("rejects numbers that can't get SMS", () => {
    expect(parseContact({ phone: "02-123-4567" })).toMatch(/Thai mobile/);
    expect(parseContact({ phone: 812345678 })).toBeNull();
  });
});
