import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("browser admin live-read UI wiring", () => {
  it("wires AdminsPage as Access Governance with all-users tabs and browser live-read", () => {
    const adminsPage = read("client/src/pages/AdminsPage.tsx");
    const hook = read("client/src/hooks/useBrowserAdminsLiveRead.ts");

    expect(adminsPage).toContain("useBrowserAdminsLiveRead");
    expect(adminsPage).toContain("הרשאות וגישה");
    expect(adminsPage).toContain("כל המשתמשים");
    expect(adminsPage).toContain("מקורות הרשאה");
    expect(adminsPage).toContain("פערים וסנכרון");
    expect(adminsPage).toContain("רענן דרך הדפדפן");
    expect(adminsPage).toContain("sitesApi.accessDirectory");
    expect(adminsPage).toContain("sitesApi.planAccessChange");
    expect(adminsPage).toContain("פעולה חסומה");
    expect(adminsPage).not.toContain("sitesApi.addSiteAdmin");
    expect(adminsPage).not.toContain("sitesApi.removeSiteAdmin");
    expect(hook).toContain("readSharePointAdminsFromBrowser");
    expect(hook).toContain("sitesApi.recordBrowserAdminLiveReadEvidence");
    expect(hook).toContain("attemptedAutoRead");
    expect(hook).toContain("נמשך מ־SharePoint דרך הדפדפן ונשמר ב־Mongo");
  });

  it("wires Site Details Admins tab through the same browser connector flow", () => {
    const siteDetails = read("client/src/pages/SiteDetailsPage.tsx");

    expect(siteDetails).toContain("useBrowserAdminsLiveRead");
    expect(siteDetails).toContain("activeTab === \"admins\"");
    expect(siteDetails).toContain("runAdminsLiveRead");
    expect(siteDetails).toContain("רענן מנהלים עכשיו");
    expect(siteDetails).toContain("AdminSourceSummaryCards");
    expect(siteDetails).toContain("AdminSourceStatusTable");
  });

  it("renders failed admin source state as Hebrew failure, not fake 0", () => {
    const component = read("client/src/components/AdminSourceSummaryCards.tsx");
    const accessService = read("server/src/services/accessDirectory.service.ts");

    expect(component).toContain("הקריאה נכשלה");
    expect(component).toContain("לא נקרא עדיין");
    expect(component).toContain("נמשך מ־SharePoint דרך הדפדפן");
    expect(component).toContain("נשמר ב־Mongo");
    expect(accessService).toContain("קריאת users_data.txt נכשלה; אין לספור זאת כאפס משתמשים.");
    expect(accessService).toContain("count,");
    expect(component).not.toContain(">Failed<");
    expect(component).not.toContain("OK (");
  });
});
