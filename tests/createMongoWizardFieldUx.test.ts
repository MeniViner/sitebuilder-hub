import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");
const between = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `Missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `Missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe("Create New Mongo Site wizard field UX", () => {
  it("documents owner-facing and infrastructure fields in the field explanation report", () => {
    const doc = read("docs/sitebuilder-hub-create-site-field-explanations.md");

    [
      "שם האתר",
      "קוד אתר / נתיב SharePoint",
      "מזהה אתר במערכת Site Builder",
      "כתובת אתר SharePoint",
      "כתובת Backend של Site Builder",
      "ספריית siteDB",
      "ספריית siteUsersDb",
      "נתיב runtime config",
      "הפניה להרשאת API",
      "שם Collection במונגו",
      "מיקום widgets_data.txt",
      "פריסה ראשונית"
    ].forEach((fieldLabel) => expect(doc).toContain(fieldLabel));

    expect(doc).toContain("## Basic Fields");
    expect(doc).toContain("## Advanced Fields");
    expect(doc).toContain("## Generated Preview");
  });

  it("keeps technical infrastructure fields out of the basic form and inside advanced settings", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const basic = between(modal, "const renderBasicFields", "const renderGeneratedDefaultsPreview");
    const advanced = between(modal, "const renderAdvancedInfrastructureFields", "const renderConnectionFields");

    [
      "Field label=\"ספריית siteDB\"",
      "Field label=\"ספריית siteUsersDb\"",
      "Field label=\"ספריית Bootstrap\"",
      "Field label=\"תיקיית Bootstrap\"",
      "Field label=\"נתיב runtime config\"",
      "Field label=\"הפניה להרשאת API\"",
      "Field label=\"שם Collection במונגו\"",
      "Field label=\"סביבת Mongo\"",
      "Field label=\"מסד נתונים Mongo\""
    ].forEach((field) => {
      expect(basic).not.toContain(field);
      expect(advanced).toContain(field);
    });
  });

  it("shows generated defaults before execution, including safeCollectionName auto-generation", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const preview = between(modal, "const renderGeneratedDefaultsPreview", "const renderAdvancedInfrastructureFields");

    expect(preview).toContain("ערכים שהמערכת מחשבת עבורך");
    expect(preview).toContain("קישור סופי לאתר");
    expect(preview).toContain("ספריית siteDB");
    expect(preview).toContain("ספריית siteUsersDb");
    expect(preview).toContain("נתיב runtime config");
    expect(preview).toContain("שם Collection במונגו");
    expect(preview).toContain("GENERATED_SAFE_COLLECTION_LABEL");
    expect(read("client/src/utils/mongoCreateUx.ts")).toContain("ייווצר אוטומטית");
  });

  it("uses human Hebrew validation and duplicate-site explanations", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const ux = read("client/src/utils/mongoCreateUx.ts");

    expect(modal).toContain("לא מוגדר Backend של Site Builder לסביבה הזאת");
    expect(modal).toContain("בחרו Backend של Site Builder מתוך ההגדרות");
    expect(modal).toContain("לא ניתן להשתמש ב־localhost עבור אתר production/classified");
    expect(modal).toContain("נראה שהוזן API key גלוי במקום credential reference");
    expect(modal).toContain("נתיב runtime config לא תקין");
    expect(modal).not.toContain("Invalid runtimeConfigPath");
    expect(modal).not.toContain("Missing credential");
    expect(ux).toContain("builder-backend-not-configured");
    expect(ux).toContain("production-localhost-backend-blocked");
    expect(ux).toContain("קוד אתר כפול בפני עצמו יכול להיות תקין");
    expect(ux).toContain("site-physical-runtime-identity-duplicate");
  });

  it("has inline help and help-center coverage for Mongo site creation", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const help = read("client/src/help/helpContent.ts");

    [
      "create.siteCode",
      "create.builderSiteId",
      "create.sharePointSiteUrl",
      "create.backendApiUrl",
      "create.credentialRef",
      "create.safeCollectionName",
      "create.runtimeConfigPath",
      "create.siteDbLibrary",
      "create.usersDbLibrary",
      "create.widgetsMapping",
      "create.initialAdmins"
    ].forEach((helpKey) => {
      expect(modal).toContain(`helpKey="${helpKey}"`);
      expect(help).toContain(`"${helpKey}"`);
    });

    expect(help).toContain("יצירת אתר Mongo חדש");
    expect(help).toContain("SharePoint מארח את קבצי האתר");
    expect(help).toContain("לא מכניסים API key גלוי באשף");
    expect(help).toContain("partially-created");
  });

  it("keeps raw technical JSON collapsed behind Hebrew technical details", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const plan = between(modal, "form.storageBackend === \"mongo\" && mongoPlan", "resolvedPreview ?");

    expect(plan).toContain("<details className=\"technical-details");
    expect(plan).toContain("<summary>פרטים טכניים</summary>");
    expect(plan).toContain("JSON.stringify");
    expect(modal.indexOf("מה המערכת הולכת ליצור")).toBeLessThan(modal.indexOf("<summary>פרטים טכניים</summary>"));
  });

  it("does not render or log a raw API key in the wizard preview", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const sitesPage = read("client/src/pages/SitesPage.tsx");

    expect(modal).toContain("לא מזינים כאן API key גלוי");
    expect(modal).not.toContain("runtimeConfig.data.content");
    expect(sitesPage).toContain("redactedPreview.apiKey");
    expect(sitesPage).not.toContain("setNotice(runtimeConfig.data.content");
  });

  it("does not route Create New Site directly to Releases deploy before provisioning", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const fieldReport = read("docs/sitebuilder-hub-create-site-field-explanations.md");

    expect(modal).toContain("קודם יש ליצור את תשתית SharePoint של האתר");
    expect(modal).toContain("לא ניתן לפרוס לפני שנוצרו siteDB / siteUsersDb / dist");
    expect(modal).toContain("השלב הבא: יצירת ספריות ותיקיות SharePoint");
    expect(modal).not.toContain("פריסה ראשונית נשארת במסך Releases");
    expect(fieldReport).not.toContain("Browser Deploy from Releases");
  });
});
