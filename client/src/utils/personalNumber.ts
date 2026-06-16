const PERSONAL_NUMBER_PATTERN = /(?:^|[^a-z0-9])s?(\d{6,8})(?:@|[^a-z0-9]|$)/i;

export function normalizePersonalNumber(value?: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  const direct = raw.match(/^s?(\d{6,8})$/i);
  if (direct?.[1]) return `s${direct[1]}`;

  const embedded = raw.match(PERSONAL_NUMBER_PATTERN);
  return embedded?.[1] ? `s${embedded[1]}` : "";
}

export function derivePersonalNumberFromSharePointIdentity(...values: unknown[]) {
  for (const value of values) {
    const personalNumber = normalizePersonalNumber(value);
    if (personalNumber) return personalNumber;
  }
  return "";
}
