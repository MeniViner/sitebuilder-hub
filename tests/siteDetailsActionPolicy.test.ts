import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  getSiteDetailsActionPolicy,
  getSiteDetailsStorageCopy
} from "../client/src/utils/siteDetailsActionPolicy";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("Site Details storage-aware P0 action policy", () => {
  it("blocks unknown-storage sites from runnable write, repair, migration, backup, and setup actions", () => {
    const blockedActions = [
      "txt-to-mongo-migration",
      "txt-admin-repair",
      "browser-txt-backup",
      "site-provision-run",
      "permissions-setup-run",
      "site-bootstrap-run"
    ] as const;

    for (const action of blockedActions) {
      const policy = getSiteDetailsActionPolicy("unknown", action);
      expect(policy.enabled, action).toBe(false);
      expect(policy.disabledReason).toContain("צריך לזהות את מקור הנתונים");
    }

    expect(getSiteDetailsActionPolicy("unknown", "txt-to-mongo-migration").visible).toBe(false);
    expect(getSiteDetailsActionPolicy("unknown", "mongo-health-read").visible).toBe(false);
    expect(getSiteDetailsStorageCopy("unknown").overviewNextAction).toContain("בדיקות קריאה בלבד");
  });

  it("blocks Mongo sites from TXT operations, current TXT-seeding setup flows, and unimplemented Mongo backup execution", () => {
    expect(getSiteDetailsActionPolicy("mongo", "browser-txt-backup").enabled).toBe(false);
    expect(getSiteDetailsActionPolicy("mongo", "browser-txt-backup").disabledReason).toContain("גיבוי TXT אינו מגבה את נתוני Mongo החיים");
    expect(getSiteDetailsActionPolicy("mongo", "txt-admin-repair").enabled).toBe(false);
    expect(getSiteDetailsActionPolicy("mongo", "txt-to-mongo-migration").enabled).toBe(false);
    expect(getSiteDetailsActionPolicy("mongo", "txt-to-mongo-migration").visible).toBe(false);
    expect(getSiteDetailsActionPolicy("mongo", "site-provision-run").enabled).toBe(false);
    expect(getSiteDetailsActionPolicy("mongo", "site-bootstrap-run").enabled).toBe(false);
    expect(getSiteDetailsActionPolicy("mongo", "mongo-backup-execution").enabled).toBe(false);
    expect(getSiteDetailsActionPolicy("mongo", "mongo-backup-execution").disabledReason).toContain("גיבוי Mongo מלא עדיין לא ממומש");
  });

  it("keeps TXT backup and repair paths available with write-risk labeling", () => {
    const backup = getSiteDetailsActionPolicy("txt", "browser-txt-backup");
    const repair = getSiteDetailsActionPolicy("txt", "txt-admin-repair");
    const migration = getSiteDetailsActionPolicy("txt", "txt-to-mongo-migration");

    expect(backup.enabled).toBe(true);
    expect(backup.helperText).toContain("קבצי מקור ה־TXT");
    expect(backup.riskClass).toBe("live-hosting-write");
    expect(repair.enabled).toBe(true);
    expect(repair.label).toBe("תיקון נתוני מנהלים בקבצי TXT");
    expect(repair.riskClass).toBe("data-source-write");
    expect(migration.enabled).toBe(true);
    expect(migration.helperText).toContain("פעולה רגישה");
  });

  it("labels Mongo/Builder as the live data source and does not claim Browser SharePoint TXT backup protects Mongo data", () => {
    const copy = getSiteDetailsStorageCopy("mongo");

    expect(copy.sourceBadge).toBe("מקור הנתונים: Mongo דרך שרת Builder");
    expect(copy.sourceDescription).toContain("SharePoint משמש לאירוח קבצי האתר וקובץ ההגדרות");
    expect(copy.sourceDescription).toContain("נתוני האתר החיים נמצאים ב־Mongo");
    expect(copy.backupsSubtitle).toContain("גיבוי TXT אינו מגבה את נתוני Mongo החיים");
    expect(copy.txtPathDescription).toContain("אינו מקור הנתונים החי");
  });

  it("distinguishes plan-only actions from live-write actions and marks permission setup as permission-changing", () => {
    const plan = getSiteDetailsActionPolicy("txt", "provision-plan");
    const run = getSiteDetailsActionPolicy("txt", "site-provision-run");
    const permissions = getSiteDetailsActionPolicy("txt", "permissions-setup-run");

    expect(plan.riskClass).toBe("plan-only");
    expect(plan.helperText).toContain("תוכנית לפני הרצה");
    expect(run.riskClass).toBe("live-hosting-write");
    expect(run.helperText).toContain("פעולה שמשנה");
    expect(permissions.riskClass).toBe("permission-write");
    expect(permissions.label).toContain("שינוי הרשאות");
    expect(permissions.helperText).toContain("פעולת שינוי הרשאות");
  });

  it("wires the Site Details page to the Hebrew action center copy instead of the old mixed label", () => {
    const siteDetails = read("client/src/pages/SiteDetailsPage.tsx");
    const unknownCopy = getSiteDetailsStorageCopy("unknown");
    const backupPolicy = getSiteDetailsActionPolicy("mongo", "browser-txt-backup");
    const planPolicy = getSiteDetailsActionPolicy("txt", "provision-plan");
    const txtRepairPolicy = getSiteDetailsActionPolicy("txt", "txt-admin-repair");
    const permissionsPolicy = getSiteDetailsActionPolicy("txt", "permissions-setup-run");

    expect(siteDetails).toContain("מרכז פעולות לאתר");
    expect(siteDetails).not.toContain("Operations / Bootstrap");
    expect(siteDetails).toContain("SiteActionCenter");
    expect(siteDetails).toContain("SiteReadinessStrip");
    expect(siteDetails).toContain("SiteWorkspaceHeader");
    expect(siteDetails).toContain("getSiteDetailsActionPolicy");
    expect(backupPolicy.disabledReason).toContain("גיבוי TXT אינו מגבה את נתוני Mongo החיים");
    expect(unknownCopy.operationsSubtitle).toContain("האתר עדיין לא זוהה כ־Mongo או TXT");
    expect(planPolicy.helperText).toContain("תוכנית לפני הרצה");
    expect(txtRepairPolicy.helperText).toContain("פעולה שמשנה נתונים");
    expect(permissionsPolicy.label).toContain("שינוי הרשאות SharePoint");
  });
});
