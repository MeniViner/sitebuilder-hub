import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeArmyEmail, completeArmyEmailsInAdminsText } from "../client/src/utils/armyEmail";
import { resetTestEnv } from "./setup/env";

const mocks = vi.hoisted(() => ({
  Site: {
    findOne: vi.fn()
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");
const between = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `Missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `Missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe("Builder backend defaults and add-site UX", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.Site.findOne.mockReset();
    mocks.Site.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  it("returns safe Builder backend runtime metadata from capabilities", async () => {
    resetTestEnv({
      SITE_BUILDER_BACKEND_API_URLS: "https://builder-backend.internal.example",
      SITE_BUILDER_DEFAULT_BACKEND_API_URL: "https://builder-backend.internal.example",
      SITE_BUILDER_DEFAULT_BACKEND_LABEL: "Production / Classified",
      SITE_BUILDER_DEFAULT_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY",
      SITE_BUILDER_BACKEND_API_KEY: "super-secret-value"
    });
    const { getBuilderBackendRuntimeSettings } = await import("../server/src/services/builderMongoHealth.service");

    const settings = getBuilderBackendRuntimeSettings();

    expect(settings.defaultBuilderBackendApiUrl).toBe("https://builder-backend.internal.example");
    expect(settings.defaultBuilderApiKeyRef).toBe("SITE_BUILDER_BACKEND_API_KEY");
    expect(settings.rawApiKeysExposed).toBe(false);
    expect(settings.builderBackendOptions).toEqual([
      expect.objectContaining({
        label: "Production / Classified",
        backendApiUrl: "https://builder-backend.internal.example",
        credentialRef: "SITE_BUILDER_BACKEND_API_KEY",
        credentialConfigured: true,
        default: true
      })
    ]);
    expect(JSON.stringify(settings)).not.toContain("super-secret-value");
  });

  it("auto-selects one backend but leaves multiple backends to a dropdown", async () => {
    resetTestEnv({
      SITE_BUILDER_BACKEND_API_URLS: "https://builder-one.example",
      SITE_BUILDER_DEFAULT_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY"
    });
    const { getBuilderBackendRuntimeSettings } = await import("../server/src/services/builderMongoHealth.service");
    expect(getBuilderBackendRuntimeSettings().defaultBuilderBackendApiUrl).toBe("https://builder-one.example");

    resetTestEnv({
      SITE_BUILDER_BACKEND_API_URLS: "https://builder-one.example,https://builder-two.example",
      SITE_BUILDER_DEFAULT_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY"
    });
    vi.resetModules();
    const { getBuilderBackendRuntimeSettings: getSettingsAgain } = await import("../server/src/services/builderMongoHealth.service");
    expect(getSettingsAgain().defaultBuilderBackendApiUrl).toBe("");

    const modal = read("client/src/components/SiteFormModal.tsx");
    expect(modal).toContain("בחרו Backend מוגדר");
    expect(modal).toContain("options.length > 1");
  });

  it("blocks Mongo plan generation when backend config is missing or production selects localhost", async () => {
    resetTestEnv({
      SITE_BUILDER_BACKEND_API_URLS: "",
      SITE_BUILDER_DEFAULT_BACKEND_API_URL: "",
      SITE_BUILDER_DEFAULT_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY",
      SITE_BUILDER_BACKEND_API_KEY: "secret"
    });
    const { buildMongoSiteCreationPlanFromInput } = await import("../server/src/services/mongoSiteCreation.service");
    const missingConfig = await buildMongoSiteCreationPlanFromInput({
      siteCode: "alphateam",
      displayName: "Alpha Team",
      environment: "dev",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      backendApiUrl: "https://typed-by-owner.example",
      builderApiKeyRef: "SITE_BUILDER_BACKEND_API_KEY",
      ownerEmail: "s8856096@army.idf.il"
    });
    expect(missingConfig.blockers).toContain("builder-backend-not-configured");

    resetTestEnv({
      SITE_BUILDER_BACKEND_API_URLS: "http://127.0.0.1:3001",
      SITE_BUILDER_DEFAULT_BACKEND_API_URL: "http://127.0.0.1:3001",
      SITE_BUILDER_DEFAULT_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY",
      SITE_BUILDER_BACKEND_API_KEY: "secret"
    });
    vi.resetModules();
    const { buildMongoSiteCreationPlanFromInput: buildPlanAgain } = await import("../server/src/services/mongoSiteCreation.service");
    const productionLocalhost = await buildPlanAgain({
      siteCode: "alphateam",
      displayName: "Alpha Team",
      environment: "production",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      backendApiUrl: "http://127.0.0.1:3001",
      builderApiKeyRef: "SITE_BUILDER_BACKEND_API_KEY",
      ownerEmail: "s8856096@army.idf.il"
    });
    expect(productionLocalhost.blockers).toContain("production-localhost-backend-blocked");
  });

  it("keeps existing-site infrastructure fields suggested/detected and advanced", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const basic = between(modal, "const renderBasicFields", "const renderGeneratedDefaultsPreview");
    const detection = between(modal, "const renderTrackDetection", "const renderTrackValidate");

    expect(modal).toContain("{ key: \"detect\", label: \"זיהוי אוטומטי\"");
    expect(detection).toContain("נתיבים שזוהו");
    expect(detection).toContain("נתונים חסרים");
    expect(detection).toContain("המערכת מציעה ערך לפי כתובת SharePoint");
    expect(detection).toContain("המערכת זיהתה runtime config קיים");
    expect(basic).toContain("flow === \"create-new\"");
    expect(basic).not.toContain("Field label=\"ספריית siteDB\"");
    expect(basic).not.toContain("Field label=\"נתיב runtime config\"");
  });

  it("shows Builder backend metadata safely in wizard, Settings, and Diagnostics", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const settings = read("client/src/pages/SettingsPage.tsx");
    const diagnostics = read("client/src/pages/DiagnosticsPage.tsx");

    expect(modal).toContain("Backend של Site Builder");
    expect(modal).toContain("נבחר אוטומטית לפי סביבת ה־HUB.");
    expect(modal).toContain("חסרה הפניה להרשאת API");
    expect(modal).toContain("backendWillBeWrittenToRuntimeConfig");
    expect(settings).toContain("Builder Backend");
    expect(settings).toContain("ברירות מחדל ליצירת אתרים");
    expect(diagnostics).toContain("Builder Backend");
    expect(`${modal}\n${settings}\n${diagnostics}`).not.toContain("super-secret-value");
  });

  it("army email auto-completion follows the exact owner/admin rule", () => {
    expect(completeArmyEmail("s8856096")).toBe("s8856096@army.idf.il");
    expect(completeArmyEmail("S8856096")).toBe("s8856096@army.idf.il");
    expect(completeArmyEmail("s8856096@army.idf.il")).toBe("s8856096@army.idf.il");
    expect(completeArmyEmail("owner@example.com")).toBe("owner@example.com");
    expect(completeArmyEmail("s885609")).toBe("s885609");
    expect(completeArmyEmailsInAdminsText("Admin | s1234567 | S8856096")).toBe("Admin | s1234567 | s8856096@army.idf.il");

    const modal = read("client/src/components/SiteFormModal.tsx");
    expect(modal).toContain("completeOwnerEmail");
    expect(modal).toContain("completeInitialAdminEmails");
    expect(modal).toContain("אפשר להקליד רק מספר אישי כמו s8856096");
  });
});
