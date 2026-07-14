import type { LabCapabilityMode, LabSeverity, LabTone } from "./dashboardLabTypes";

export const severityWeight: Record<LabSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  clear: 0
};

export const severityLabelHe: Record<LabSeverity, string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "בינוני",
  clear: "תקין"
};

export const toneClass: Record<LabTone, string> = {
  success: "lab-tone-success",
  warning: "lab-tone-warning",
  danger: "lab-tone-danger",
  info: "lab-tone-info",
  neutral: "lab-tone-neutral"
};

export const capabilityModeLabel: Record<LabCapabilityMode, string> = {
  live: "Live",
  cached: "Cached",
  metadata: "Metadata",
  blocked: "Blocked",
  unknown: "Unknown"
};

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function pct(value: number, total: number) {
  return total ? clampPercent((value / total) * 100) : 0;
}

export function formatPercent(value: number) {
  return `${clampPercent(value).toLocaleString("he-IL")}%`;
}

export function toneFromSeverity(severity: LabSeverity): LabTone {
  if (severity === "critical") return "danger";
  if (severity === "high" || severity === "medium") return "warning";
  return "success";
}

export function mostSevere<T extends { severity: LabSeverity }>(items: T[]): LabSeverity {
  return items.reduce<LabSeverity>((current, item) =>
    severityWeight[item.severity] > severityWeight[current] ? item.severity : current, "clear");
}

export function daysSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - time) / 86_400_000);
}

export function freshnessBucket(value?: string | null) {
  const age = daysSince(value);
  if (!Number.isFinite(age)) return "אין ראיה";
  if (age <= 1) return "24 שעות";
  if (age <= 7) return "עד שבוע";
  if (age <= 30) return "עד חודש";
  if (age <= 90) return "עד רבעון";
  return "ישן";
}

export function compactList(values: Array<string | undefined>, fallback = "לא ידוע", limit = 3) {
  const filtered = values.map((value) => value?.trim()).filter(Boolean) as string[];
  if (!filtered.length) return fallback;
  const visible = filtered.slice(0, limit).join(", ");
  return filtered.length > limit ? `${visible} +${filtered.length - limit}` : visible;
}
