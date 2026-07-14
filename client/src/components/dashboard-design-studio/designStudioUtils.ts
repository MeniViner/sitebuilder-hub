import type { Site } from "../../types/site";
import { formatDateTime, formatNumber, healthStatusLabel, siteStatusLabel } from "../../utils/format";
import type {
  DashboardLabData,
  LabCapability,
  LabMetric,
  LabRiskItem,
  LabSeverity,
  LabTone
} from "../dashboard-lab/dashboardLabTypes";
import { capabilityModeLabel, compactList, formatPercent, severityLabelHe } from "../dashboard-lab/dashboardLabUtils";

export type DesignStudioTone = LabTone;

export const studioToneClass: Record<DesignStudioTone, string> = {
  success: "dstudio-tone-success",
  warning: "dstudio-tone-warning",
  danger: "dstudio-tone-danger",
  info: "dstudio-tone-info",
  neutral: "dstudio-tone-neutral"
};

export const severityShortLabel: Record<LabSeverity, string> = {
  critical: "דחוף",
  high: "גבוה",
  medium: "דורש בדיקה",
  clear: "תקין"
};

const capabilityModeHumanLabel: Record<string, string> = {
  live: "live",
  cached: "cached",
  metadata: "metadata",
  blocked: "blocked",
  unknown: "not checked",
  unavailable: "unavailable"
};

export function capabilityModeText(capability: LabCapability) {
  return capabilityModeHumanLabel[capability.mode] || capabilityModeLabel[capability.mode] || "not checked";
}

export function selectCoreCapabilities(data: DashboardLabData) {
  const wanted = ["api", "mongo", "browser", "write"];
  return wanted
    .map((key) => data.capabilityStrip.find((capability) => capability.key === key))
    .filter((capability): capability is LabCapability => Boolean(capability));
}

export function dashboardPosture(data: DashboardLabData) {
  if (data.overallSeverity === "critical") {
    return {
      title: "יש טיפול דחוף לפני שממשיכים",
      short: "טיפול דחוף",
      copy: "ה־Hub עובד כמסך החלטה, אבל יש חסימה שכדאי לפתוח לפני פריסה, שחזור או שינוי הרשאות.",
      tone: "danger" as LabTone
    };
  }
  if (data.overallSeverity === "high" || data.overallSeverity === "medium") {
    return {
      title: "המערכת עובדת, ויש כמה דברים לבדוק",
      short: "יציב עם תשומת לב",
      copy: "אין צורך בדרמה, אבל כדאי לטפל בפריטים שמופיעים כאן לפני פעולה רחבה.",
      tone: "warning" as LabTone
    };
  }
  return {
    title: "הצי נראה יציב לפתיחת יום",
    short: "נראה יציב",
    copy: "לא זוהו כרגע כשלים מרכזיים, פערי גיבוי או פערי גרסה שמחייבים פעולה מיידית.",
    tone: "success" as LabTone
  };
}

export function primaryMetrics(data: DashboardLabData): LabMetric[] {
  return data.topMetrics.slice(0, 4);
}

export function compactPriorityQueue(data: DashboardLabData, limit = 4): LabRiskItem[] {
  return data.riskQueue.slice(0, limit);
}

export function domainSignal(domain: DashboardLabData["domains"][number]) {
  const topRisk = domain.risks.find((risk) => risk.severity !== "clear");
  const metric = domain.metrics[0];
  return {
    text: topRisk?.title || metric?.detail || domain.subtitle,
    tone: topRisk?.tone || domain.tone
  };
}

export function domainStatusLabel(tone: LabTone) {
  if (tone === "danger") return "דורש טיפול";
  if (tone === "warning") return "דורש בדיקה";
  if (tone === "success") return "נראה מוכן";
  if (tone === "info") return "בבדיקה";
  return "לא נבדק";
}

export function riskCategoryLabel(category: LabRiskItem["category"]) {
  const labels: Record<LabRiskItem["category"], string> = {
    connectivity: "חיבור",
    health: "תקינות",
    release: "גרסה",
    backup: "גיבוי",
    access: "הרשאות",
    jobs: "פעולות",
    data: "Data"
  };
  return labels[category];
}

export function siteTone(site: Site): LabTone {
  if (site.status === "failed" || site.derivedHealthStatus === "failed" || site.backupStatus === "failed") return "danger";
  if (
    site.status === "warning" ||
    site.derivedHealthStatus === "warning" ||
    site.versionStatus === "outdated" ||
    !site.lastBackupAt ||
    site.adminSyncStatus === "failed"
  ) return "warning";
  if (site.derivedHealthStatus === "healthy" || site.status === "active") return "success";
  return "neutral";
}

export function siteShape(site: Site) {
  if (site.storageBackend === "mongo") return "mongo";
  if (site.storageBackend === "txt") return "txt";
  return "unknown";
}

export function siteIssueLabel(site: Site) {
  if (site.status === "failed" || site.derivedHealthStatus === "failed") return "כשל Health";
  if (site.backupStatus === "failed") return "גיבוי נכשל";
  if (!site.lastBackupAt) return "אין ראיית גיבוי";
  if (site.versionStatus === "outdated") return "גרסה מאחור";
  if (site.adminSyncStatus === "failed") return "פער הרשאות";
  if (site.status === "warning" || site.derivedHealthStatus === "warning") return "אזהרת Health";
  return "ללא סימון חריג";
}

export function siteSubline(site: Site) {
  return compactList([
    site.environment && site.environment !== "unknown" ? site.environment : undefined,
    site.storageBackend && site.storageBackend !== "unknown" ? site.storageBackend.toUpperCase() : undefined,
    healthStatusLabel(site.derivedHealthStatus),
    site.lastBackupAt ? `גיבוי ${formatDateTime(site.lastBackupAt)}` : undefined
  ], siteStatusLabel(site.status), 4);
}

export function topFleetSite(data: DashboardLabData) {
  return data.watchlist[0]?.site || data.activeSites.find((site) => siteTone(site) !== "success") || data.activeSites[0] || data.sites[0] || null;
}

export function environmentLabel(value?: string) {
  const labels: Record<string, string> = {
    production: "Production",
    staging: "Staging",
    test: "Test",
    dev: "Dev",
    local: "Local",
    unknown: "לא מסווג"
  };
  return labels[value || "unknown"] || value || "לא מסווג";
}

export function groupSitesByEnvironment(sites: Site[]) {
  const groups = sites.reduce<Record<string, Site[]>>((acc, site) => {
    const key = site.environment || "unknown";
    acc[key] = acc[key] || [];
    acc[key].push(site);
    return acc;
  }, {});
  const preferred = ["production", "staging", "test", "dev", "local", "unknown"];
  return Object.entries(groups)
    .sort(([a], [b]) => {
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      return (ai === -1 ? preferred.length : ai) - (bi === -1 ? preferred.length : bi);
    })
    .map(([environment, group]) => ({ environment, sites: group }));
}

export function chartPercent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

export function readinessLine(data: DashboardLabData) {
  return [
    `${formatNumber(data.counts.activeSites)} אתרים פעילים`,
    `${formatNumber(data.counts.attentionItems)} פריטי תשומת לב`,
    `${formatPercent(data.releaseAdoptionPercent)} אימוץ גרסה`,
    `${formatPercent(data.backupReliabilityPercent)} אמינות גיבוי`
  ].join(" · ");
}

export function severityLabel(item: LabRiskItem) {
  return severityShortLabel[item.severity] || severityLabelHe[item.severity];
}
