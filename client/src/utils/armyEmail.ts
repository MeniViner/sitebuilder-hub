export const ARMY_EMAIL_DOMAIN = "army.idf.il";
const personalNumberEmailPrefix = /^[a-zA-Z]\d{7}$/;

export function completeArmyEmail(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.includes("@")) return trimmed;
  return personalNumberEmailPrefix.test(trimmed) ? `${trimmed.toLowerCase()}@${ARMY_EMAIL_DOMAIN}` : trimmed;
}

export function completeArmyEmailsInAdminsText(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => {
      const separator = line.includes("|") ? "|" : line.includes(",") ? "," : "";
      if (!separator) return completeArmyEmail(line) === line.trim() ? line : completeArmyEmail(line);
      const parts = line.split(separator);
      if (parts.length < 3) return line;
      const emailIndex = parts.length - 1;
      const completed = completeArmyEmail(parts[emailIndex]);
      if (completed === parts[emailIndex].trim()) return line;
      parts[emailIndex] = ` ${completed}`;
      return parts.map((part) => part.trim()).join(separator === "|" ? " | " : ", ");
    })
    .join("\n");
}
