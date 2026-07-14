export type BackupScheduleFrequency = "daily" | "weekly" | "monthly" | "custom";
export type BackupScheduleRetentionMode = "none" | "count" | "days" | "count-and-days";
export type BackupScheduleExecutionMode =
  | "browser-manual"
  | "builder-backend"
  | "backend-service-auth-required"
  | "not-configured";

export type BackupScheduleInput = {
  enabled?: boolean;
  paused?: boolean;
  frequency?: BackupScheduleFrequency;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  timeOfDay?: string;
  timezone?: string;
  intervalMinutes?: number;
  retention?: {
    mode?: BackupScheduleRetentionMode;
    keepLast?: number;
    deleteOlderThanDays?: number;
  };
};

export type NormalizedBackupSchedule = {
  enabled: boolean;
  paused: boolean;
  frequency: BackupScheduleFrequency;
  daysOfWeek: number[];
  dayOfMonth?: number;
  timeOfDay: string;
  timezone: string;
  intervalMinutes: number;
  retention: {
    mode: BackupScheduleRetentionMode;
    keepLast: number;
    deleteOlderThanDays: number;
  };
  executionMode: BackupScheduleExecutionMode;
  nextRunAt?: Date;
};

const DEFAULT_TIMEZONE = "Asia/Jerusalem";
const DEFAULT_TIME_OF_DAY = "02:00";

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
};

const isValidTimezone = (timezone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const normalizeTimezone = (value: unknown) => {
  const timezone = String(value || "").trim() || DEFAULT_TIMEZONE;
  return isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
};

const normalizeTimeOfDay = (value: unknown) => {
  const raw = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : DEFAULT_TIME_OF_DAY;
};

const uniqueSortedDays = (days: unknown, fallback: number[]) => {
  const values = Array.isArray(days) ? days : fallback;
  const normalized = values
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return Array.from(new Set(normalized)).sort((a, b) => a - b);
};

const retentionMode = (value: unknown): BackupScheduleRetentionMode =>
  ["none", "count", "days", "count-and-days"].includes(String(value || ""))
    ? String(value) as BackupScheduleRetentionMode
    : "count";

const frequencyValue = (value: unknown): BackupScheduleFrequency =>
  ["daily", "weekly", "monthly", "custom"].includes(String(value || ""))
    ? String(value) as BackupScheduleFrequency
    : "daily";

const localParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second)
  };
};

const localUtcMs = (parts: ReturnType<typeof localParts>) =>
  Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);

const zonedTimeToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
) => {
  const desiredLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(desiredLocalMs);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actualLocalMs = localUtcMs(localParts(guess, timezone));
    const delta = desiredLocalMs - actualLocalMs;
    if (delta === 0) break;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
};

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const addLocalDays = (parts: ReturnType<typeof localParts>, days: number) => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
};

const localDayOfWeek = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();

const parseTime = (timeOfDay: string) => {
  const [hour, minute] = timeOfDay.split(":").map(Number);
  return { hour, minute };
};

export const inferBackupScheduleExecutionMode = (site: any): BackupScheduleExecutionMode => {
  const backend = String(site?.storageBackend || "unknown");
  if (backend === "mongo") {
    return site?.recoveryState?.backupCapability?.canRunScheduledBackup
      ? "builder-backend"
      : "not-configured";
  }
  if (backend === "txt") return "backend-service-auth-required";
  return "not-configured";
};

export function computeNextBackupRun(
  schedule: Pick<NormalizedBackupSchedule, "enabled" | "paused" | "frequency" | "daysOfWeek" | "dayOfMonth" | "timeOfDay" | "timezone" | "intervalMinutes">,
  now = new Date()
) {
  if (!schedule.enabled || schedule.paused) return undefined;
  const { hour, minute } = parseTime(schedule.timeOfDay);

  if (schedule.frequency === "custom") {
    return new Date(now.getTime() + clampInt(schedule.intervalMinutes, 5, 60 * 24 * 366, 24 * 60) * 60_000);
  }

  const nowLocal = localParts(now, schedule.timezone);
  for (let offset = 0; offset <= 370; offset += 1) {
    const localDate = addLocalDays(nowLocal, offset);
    if (schedule.frequency === "weekly" && !schedule.daysOfWeek.includes(localDayOfWeek(localDate.year, localDate.month, localDate.day))) {
      continue;
    }
    if (schedule.frequency === "monthly") {
      const dayOfMonth = Math.min(schedule.dayOfMonth || nowLocal.day, daysInMonth(localDate.year, localDate.month));
      if (localDate.day !== dayOfMonth) continue;
    }
    const candidate = zonedTimeToUtc(localDate.year, localDate.month, localDate.day, hour, minute, schedule.timezone);
    if (candidate.getTime() > now.getTime() + 1000) return candidate;
  }

  return undefined;
}

export function normalizeBackupScheduleInput(input: BackupScheduleInput, site: any, now = new Date()): NormalizedBackupSchedule {
  const frequency = frequencyValue(input.frequency);
  const timezone = normalizeTimezone(input.timezone);
  const timeOfDay = normalizeTimeOfDay(input.timeOfDay);
  const daysOfWeek = frequency === "weekly" ? uniqueSortedDays(input.daysOfWeek, [1]) : [];
  const intervalMinutes = clampInt(input.intervalMinutes, 5, 60 * 24 * 366, frequency === "custom" ? 24 * 60 : 24 * 60);
  const retention = {
    mode: retentionMode(input.retention?.mode),
    keepLast: clampInt(input.retention?.keepLast, 1, 1000, 14),
    deleteOlderThanDays: clampInt(input.retention?.deleteOlderThanDays, 1, 3650, 90)
  };
  const normalized: NormalizedBackupSchedule = {
    enabled: Boolean(input.enabled),
    paused: Boolean(input.paused),
    frequency,
    daysOfWeek,
    dayOfMonth: frequency === "monthly" ? clampInt(input.dayOfMonth, 1, 31, 1) : undefined,
    timeOfDay,
    timezone,
    intervalMinutes,
    retention,
    executionMode: inferBackupScheduleExecutionMode(site)
  };
  normalized.nextRunAt = computeNextBackupRun(normalized, now);
  return normalized;
}
