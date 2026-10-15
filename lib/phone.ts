/**
 * Thai mobile numbers are 9 digits after the 66 country code and start with
 * 6, 8 or 9 (e.g. 081-234-5678 → +66812345678). Landlines (02-…) can't get SMS.
 */
export function normalizeThaiPhone(raw: string): string | null {
  const s = raw.trim().replace(/[\s\-.()]/g, "");
  let rest: string;
  if (/^\+66\d+$/.test(s)) rest = s.slice(3);
  else if (/^66\d{9}$/.test(s)) rest = s.slice(2);
  else if (/^0\d{9}$/.test(s)) rest = s.slice(1);
  else return null;
  // Some people write +66 0812345678.
  if (rest.length === 10 && rest.startsWith("0")) rest = rest.slice(1);
  return /^[689]\d{8}$/.test(rest) ? `+66${rest}` : null;
}

/** +66812345678 → 081-234-5678, for showing to the host. */
export function displayThaiPhone(e164: string): string {
  const m = /^\+66(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]}-${m[2]}-${m[3]}` : e164;
}
