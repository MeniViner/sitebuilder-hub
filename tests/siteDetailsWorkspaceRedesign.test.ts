import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  getSiteDetailsActionPolicy,
  getSiteDetailsStorageCopy,
  siteDetailsConnectorLabel,
  siteDetailsRiskLabel
} from "../client/src/utils/siteDetailsActionPolicy";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("Site Details workspace redesign", () => {
  it("uses the new workspace tabs and preserves legacy query-tab redirects", () => {
    const source = read("client/src/pages/SiteDetailsPage.tsx");

    [
      "סקירה",
      "פריסה וגרסאות",
      "גיבויים ושחזור",
      "גישה ומנהלים",
      "תקינות וחיבורים",
      "אירוח ונתיבים",
      "פעילות ויומן",
      "הגדרות מתקדמות"
    ].forEach((label) => expect(source).toContain(`label: "${label}"`));

    expect(source).toContain("paths: \"hosting\"");
    expect(source).toContain("versions: \"deployment\"");
    expect(source).toContain("backups: \"recovery\"");
    expect(source).toContain("admins: \"access\"");
    expect(source).toContain("jobs: \"activity\"");
    expect(source).toContain("audit: \"activity\"");
    expect(source).toContain("notes: \"advanced\"");
  });

  it("renders the above-fold workspace header, readiness strip, next action, and grouped action center", () => {
    const source = read("client/src/pages/SiteDetailsPage.tsx");
    const kpiCard = read("client/src/components/KpiCard.tsx");
    const styles = read("client/src/styles/index.css");

    [
      "SiteWorkspaceHeader",
      "SourceOfTruthBanner",
      "SiteReadinessStrip",
      "SiteNextActionPanel",
      "SiteActionCenter",
      "SiteDetailsScrollRegion",
      "ConnectorRiskToken"
    ].forEach((componentName) => expect(source).toContain(componentName));

    [
      "בדיקות ללא שינוי",
      "פעולות ניהול ב-Hub",
      "פעולות SharePoint",
      "פעולות Mongo",
      "פעולות רגישות",
      "פרטים טכניים"
    ].forEach((groupTitle) => expect(source).toContain(groupTitle));

    expect(source).toContain("connector: siteDetailsConnectorLabel(policy.connectorMode)");
    expect(source).toContain("risk: siteDetailsRiskLabel(policy.riskClass)");
    expect(source).toContain("disabledReason: policy.enabled ? undefined : policy.disabledReason");
    expect(source).toContain("ActionCommandList");
    expect(source).toContain("secondary-actions-panel");
    expect(source).toContain("site-details-tab-active");
    expect(source).not.toContain("SiteDetailsScrollRegion label=\"מרכז פעולות לאתר\" variant=\"tall\"");
    expect(source).toContain("SiteDetailsScrollRegion label=\"היסטוריית פריסות\" variant=\"tall\"");
    expect(source).toContain("SiteDetailsScrollRegion label=\"היסטוריית גיבויים\" variant=\"tall\"");
    expect(source).toContain("SiteDetailsScrollRegion label=\"פעולות והרצות\" variant=\"tall\"");
    expect(source).toContain("SiteDetailsScrollRegion label=\"יומן פעולות\" variant=\"tall\"");
    expect(source).toContain("backupCapabilityStatusLabel");
    expect(kpiCard).toContain("kpi-value-text");
    expect(styles).toContain(".kpi-value-text");
    expect(styles).toContain(".site-details-scroll-region");
    expect(styles).toContain(".site-details-scroll-region .data-table thead th");
  });

  it("separates overview, recovery, access, health, hosting, and activity into operator-focused panels", () => {
    const source = read("client/src/pages/SiteDetailsPage.tsx");

    [
      "סקירת אתר",
      "אחריות ומצב אחרון",
      "מה מגובה",
      "מוכנות שחזור",
      "השוואת מקורות מנהלים וגישה",
      "מקורות שנקראו",
      "פערים לטיפול",
      "מקור הנתונים",
      "פעולות בדיקה",
      "נתיבי אירוח ראשיים",
      "פעולות והרצות",
      "יומן פעולות"
    ].forEach((copy) => expect(source).toContain(copy));

    expect(source).not.toContain("Operations / Bootstrap");
    expect(source).not.toContain("קבלת יומן");
  });

  it("keeps copy controls small and limited to path or advanced rows", () => {
    const siteDetails = read("client/src/pages/SiteDetailsPage.tsx");
    const copyButton = read("client/src/components/CopyButton.tsx");
    const linkRow = read("client/src/components/LinkRow.tsx");

    expect(copyButton).toContain("iconOnly");
    expect(copyButton).toContain("aria-label={label}");
    expect(copyButton).toContain("copy-icon-button");
    expect(linkRow).toContain("copyMode");
    expect(siteDetails).toContain("<SiteInfoRow label=\"בעל האתר\"");
    expect(siteDetails).toContain("showCopy={false}");
    expect(siteDetails).toContain("copyMode=\"icon\"");
  });

  it("renders admin source comparison as a table/list with hidden technical details", () => {
    const component = read("client/src/components/AdminSourceSummaryCards.tsx");

    [
      "סוג מקור",
      "סמכות",
      "סטטוס קריאה",
      "עודכן לאחרונה",
      "רלוונטיות",
      "admin-source-row-details"
    ].forEach((copy) => expect(component).toContain(copy));

    expect(component).toContain("לא רלוונטי לאתר Mongo");
    expect(component).toContain("גישה לאירוח בלבד");
    expect(component).toContain("מקור אמת לאפליקציה");
  });

  it("keeps Mongo, TXT, and unknown storage actions honest", () => {
    const unknownBackup = getSiteDetailsActionPolicy("unknown", "browser-txt-backup");
    const mongoTxtBackup = getSiteDetailsActionPolicy("mongo", "browser-txt-backup");
    const mongoBackup = getSiteDetailsActionPolicy("mongo", "mongo-backup-execution");
    const txtBackup = getSiteDetailsActionPolicy("txt", "browser-txt-backup");

    expect(unknownBackup.enabled).toBe(false);
    expect(unknownBackup.disabledReason).toContain("צריך לזהות את מקור הנתונים");
    expect(getSiteDetailsActionPolicy("unknown", "mongo-health-read").visible).toBe(false);

    expect(mongoTxtBackup.enabled).toBe(false);
    expect(mongoTxtBackup.disabledReason).toContain("גיבוי TXT אינו מגבה את נתוני Mongo החיים");
    expect(mongoBackup.visible).toBe(true);
    expect(mongoBackup.enabled).toBe(false);
    expect(mongoBackup.disabledReason).toContain("גיבוי Mongo מלא עדיין לא ממומש");

    expect(txtBackup.enabled).toBe(true);
    expect(txtBackup.helperText).toContain("קבצי מקור ה־TXT");
    expect(getSiteDetailsActionPolicy("txt", "mongo-backup-execution").visible).toBe(false);
  });

  it("uses clear source-of-truth and action token labels", () => {
    expect(getSiteDetailsStorageCopy("mongo").sourceBadge).toBe("מקור הנתונים: Mongo דרך שרת Builder");
    expect(getSiteDetailsStorageCopy("txt").sourceBadge).toBe("מקור הנתונים: קבצי TXT ב־SharePoint");
    expect(getSiteDetailsStorageCopy("unknown").sourceBadge).toBe("מקור הנתונים לא זוהה");
    expect(siteDetailsConnectorLabel("browser-sharepoint")).toContain("הדפדפן המחובר ל־SharePoint");
    expect(siteDetailsConnectorLabel("mongo-backend")).toContain("שרת Builder");
    expect(siteDetailsRiskLabel("data-source-write")).toBe("משנה מקור נתונים");
    expect(siteDetailsRiskLabel("not-implemented")).toBe("לא ממומש עדיין");
  });
});
