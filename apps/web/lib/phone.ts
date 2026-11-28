// Shared phone helpers — safe to import from both client and server code.
// Canonical display format: "+250 788 123 456" for Rwanda, "+CC …" grouped otherwise.

const group3 = (s: string) => (s.match(/.{1,3}/g) ?? []).join(" ");

export type PhoneCheck = { ok: boolean; value: string; message?: string };

/**
 * Normalise user input to the canonical spaced format.
 * Accepts: +250 788 123 456 / +250788123456 / 0788123456 / 250788123456 / +2547…
 */
export function normalizePhone(input: string): PhoneCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, value: "", message: "Phone is required." };
  const compact = raw.replace(/[\s().-]/g, "");
  const digits = compact.replace(/\D/g, "");

  if (/^0\d{9}$/.test(digits) && compact.startsWith("0")) {
    // Local Rwandan format: 0788 123 456 → +250 788 123 456
    return formatRwandan(digits.slice(1));
  }
  if (/^250\d{9}$/.test(digits) && !compact.startsWith("+")) {
    return formatRwandan(digits.slice(3));
  }
  if (!/^\+[1-9]\d{6,14}$/.test(compact)) {
    return { ok: false, value: raw, message: "Enter a phone with its country code, e.g. +250 788 000 000." };
  }
  if (compact.startsWith("+250")) {
    return formatRwandan(compact.slice(4));
  }
  // International: keep a 1-digit country code for +1, otherwise 3 digits, group the rest.
  const body = compact.slice(1);
  const ccLen = body.startsWith("1") ? 1 : 3;
  const cc = body.slice(0, ccLen);
  const rest = body.slice(ccLen);
  return { ok: true, value: `+${cc}${rest ? ` ${group3(rest)}` : ""}` };
}

function formatRwandan(national: string): PhoneCheck {
  if (!/^7[2389]\d{7}$/.test(national)) {
    return { ok: false, value: `+250 ${national}`, message: "Rwandan numbers look like +250 788 123 456." };
  }
  return { ok: true, value: `+250 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}` };
}

/** Live auto-format while typing. Always preserves a leading +. */
export function formatPhoneInput(raw: string): string {
  if (!raw) return "";
  let cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = `+250${cleaned.slice(1)}`;
  } else if (!cleaned.startsWith("+")) {
    cleaned = `+250${cleaned.replace(/^\+/, "")}`;
  }
  const digits = cleaned.slice(1).replace(/\D/g, "");
  if (!digits) return "+";
  let ccLen = 3;
  if (digits.startsWith("1")) ccLen = 1;
  if (digits.length <= 3) ccLen = digits.length;
  const cap = digits.startsWith("250") ? 12 : 17; // country code + national number
  const capped = digits.slice(0, cap);
  const cc = capped.slice(0, ccLen);
  const rest = capped.slice(ccLen);
  return `+${cc}${rest ? ` ${group3(rest)}` : ""}`;
}
