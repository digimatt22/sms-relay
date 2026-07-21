export function normalizePhoneNumber(value: string) {
  return parsePhoneNumber(value).normalized;
}

export function parsePhoneNumber(value: string) {
  const input = String(value || "").trim();
  const cleaned = input
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();

  if (!cleaned) {
    throw new Error("Phone number is required");
  }

  if (/[A-Za-z]/.test(cleaned)) {
    throw new Error("Phone number cannot contain letters or extensions");
  }

  const plusCount = (cleaned.match(/\+/g) || []).length;
  if (plusCount > 1 || (plusCount === 1 && !cleaned.startsWith("+"))) {
    throw new Error("Phone number can only include + at the beginning");
  }

  const normalizedSymbols = cleaned.replace(/[()\s.\-–—]/g, "");
  if (!/^\+?\d+$/.test(normalizedSymbols)) {
    throw new Error("Phone number contains unsupported characters");
  }

  const digits = normalizedSymbols.replace(/\D/g, "");
  let normalized: string;
  if (normalizedSymbols.startsWith("+")) {
    normalized = `+${digits}`;
  } else if (digits.length === 10) {
    normalized = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    normalized = `+${digits}`;
  } else {
    throw new Error("Phone number must be E.164 or a 10-digit US number");
  }

  const normalizedDigits = normalized.slice(1);
  if (normalizedDigits.length < 8 || normalizedDigits.length > 15) {
    throw new Error("Phone number must contain 8 to 15 digits");
  }

  return { normalized };
}
