import { expect, test, type Page } from "@playwright/test";

const scenarioUrl = (scenario: string, route = "/") => `/?scenario=${encodeURIComponent(scenario)}#${route}`;

async function openScenario(page: Page, scenario = "admin", route = "/") {
  await page.goto(scenarioUrl(scenario, route));
  const main = page.locator("#main-content");
  await expect(main).toBeVisible();
  await expect(main.getByRole("heading").first()).toBeVisible();
}

async function fillSetupToReview(page: Page) {
  await page.getByLabel("שם האתר").fill("אתר בדיקה");
  await page.getByLabel("קוד האתר").fill("qa-site");
  await page.getByLabel("מספר אישי של הבעלים").fill("s9000002");
  await page.getByLabel("דוא״ל של הבעלים").fill("qa.owner@example.org");
  await page.getByRole("button", { name: "המשך" }).click();
  await page.getByLabel("כתובת אתר SharePoint").fill("https://portal.example/sites/qa-site");
  await page.getByRole("button", { name: "המשך" }).click();
  await expect(page.getByText("לפני יצירה")).toBeVisible();
}

test("01 Dashboard loads", async ({ page }) => {
  await openScenario(page);
  await expect(page.getByRole("heading", { level: 1, name: "לוח בקרה" })).toBeVisible();
  await expect(page.locator(".normal-metrics article")).toHaveCount(3);
});

test("02 the four primary navigation links work", async ({ page }) => {
  await openScenario(page);
  const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
  await expect(nav.getByRole("link")).toHaveCount(4);
  for (const [label, heading] of [["אתרים", "אתרים"], ["פעולות", "פעולות"], ["הגדרות", "הגדרות"], ["לוח בקרה", "לוח בקרה"]] as const) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("03 Sites search filters managed sites", async ({ page }) => {
  await openScenario(page, "admin", "/sites");
  await expect(page.locator(".normal-site-summary")).toHaveCount(10);
  await page.getByRole("textbox", { name: "חיפוש אתר" }).fill("גרסה ישנה");
  await expect(page.locator(".normal-site-summary")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "גרסה ישנה" })).toBeVisible();
});

test("04 Admin sees mutation actions", async ({ page }) => {
  await openScenario(page, "admin", "/sites");
  await expect(page.getByRole("link", { name: "יצירת אתר" })).toBeVisible();
  await openScenario(page, "admin", "/sites/managed-ready");
  await expect(page.getByRole("button", { name: "בדיקה עכשיו" })).toBeVisible();
});

test("05 Viewer does not see enabled mutation actions", async ({ page }) => {
  await openScenario(page, "viewer", "/sites");
  await expect(page.getByRole("link", { name: "יצירת אתר" })).toHaveCount(0);
  await openScenario(page, "viewer", "/sites/managed-ready");
  await expect(page.getByRole("button", { name: "בדיקה עכשיו" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "גיבויים" }).first()).toBeVisible();
});

test("06 malformed role fails closed to Viewer", async ({ page }) => {
  await openScenario(page, "unknown-role", "/settings");
  await expect(page.getByText("צופה", { exact: true })).toBeVisible();
  await expect(page.getByText("הגדרות מתקדמות", { exact: true })).toHaveCount(0);
  await openScenario(page, "unknown-role", "/sites/new");
  await expect(page.getByText("העמוד אינו פעיל במצב הנוכחי")).toBeVisible();
});

test("07 setup cannot advance with invalid required fields", async ({ page }) => {
  await openScenario(page, "admin", "/sites/new");
  await expect(page.getByRole("button", { name: "המשך" })).toBeDisabled();
  await page.getByLabel("שם האתר").fill("אתר בדיקה");
  await page.getByLabel("קוד האתר").fill("qa-site");
  await page.getByLabel("מספר אישי של הבעלים").fill("s9000002");
  await page.getByLabel("דוא״ל של הבעלים").fill("not-an-email");
  await expect(page.getByRole("button", { name: "המשך" })).toBeDisabled();
});

test("08 setup moves through valid non-writing stages", async ({ page }) => {
  await openScenario(page, "admin", "/sites/new");
  await page.getByLabel("שם האתר").fill("אתר בדיקה");
  await page.getByLabel("קוד האתר").fill("qa-site");
  await page.getByLabel("מספר אישי של הבעלים").fill("s9000002");
  await page.getByLabel("דוא״ל של הבעלים").fill("qa.owner@example.org");
  await page.getByRole("button", { name: "המשך" }).click();
  await page.getByLabel("כתובת אתר SharePoint").fill("invalid-url");
  await expect(page.getByRole("button", { name: "המשך" })).toBeDisabled();
  await page.getByLabel("כתובת אתר SharePoint").fill("https://portal.example/sites/qa-site");
  await page.getByRole("button", { name: "המשך" }).click();
  await expect(page.getByText("לפני יצירה")).toBeVisible();
  await expect(page.getByRole("button", { name: "יצירת האתר" })).toBeVisible();
});

test("09 all five Site workspace areas open", async ({ page }) => {
  await openScenario(page, "admin", "/sites/managed-ready");
  const tabs = page.getByRole("navigation", { name: "אזורי האתר" });
  await expect(tabs.getByRole("button")).toHaveCount(5);
  for (const label of ["סקירה", "גישה", "מבנה", "גיבויים", "פעילות"]) {
    await tabs.getByRole("button", { name: label }).click();
    await expect(tabs.getByRole("button", { name: label })).toHaveAttribute("aria-current", "page");
  }
});

test("10 legacy tab queries map into the five-area workspace", async ({ page }) => {
  for (const [tab, area] of [["health", "סקירה"], ["admins", "גישה"], ["advanced", "מבנה"], ["recovery", "גיבויים"], ["audit", "פעילות"]] as const) {
    await openScenario(page, "admin", `/sites/managed-ready?tab=${tab}`);
    await expect(page.getByRole("navigation", { name: "אזורי האתר" }).getByRole("button", { name: area })).toHaveAttribute("aria-current", "page");
  }
});

test("11 Operations presents human states rather than raw Jobs", async ({ page }) => {
  await openScenario(page, "admin", "/operations");
  await expect(page.getByText("בתהליך", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("נכשל", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("פעולה באתר", { exact: true })).toBeVisible();
  await expect(page.getByText(/internal_collection_reconcile|browser-required|partially-failed|Jobs/)).toHaveCount(0);
});

test("12 Help is unavailable in Normal mode", async ({ page }) => {
  await openScenario(page, "admin", "/help");
  await expect(page.getByText("העמוד אינו פעיל במצב הנוכחי")).toBeVisible();
});

test("13 Labs are unavailable in Normal mode", async ({ page }) => {
  await openScenario(page, "admin", "/dashboard-lab");
  await expect(page.getByText("העמוד אינו פעיל במצב הנוכחי")).toBeVisible();
});

test("14 Diagnostics are gated in Normal mode", async ({ page }) => {
  await openScenario(page, "admin", "/diagnostics");
  await expect(page.getByText("העמוד אינו פעיל במצב הנוכחי")).toBeVisible();
});

test("15 Advanced Settings is Admin-only", async ({ page }) => {
  await openScenario(page, "viewer", "/advanced/settings");
  await expect(page.getByText("העמוד אינו פעיל במצב הנוכחי")).toBeVisible();
  await openScenario(page, "admin", "/advanced/settings");
  await expect(page.getByRole("heading", { level: 1, name: "הגדרות" })).toBeVisible();
  await expect(page.getByText("העמוד אינו פעיל במצב הנוכחי")).toHaveCount(0);
});

test("16 mobile navigation traps focus, closes with Escape, and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openScenario(page);
  const trigger = page.getByRole("button", { name: "פתיחת ניווט" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Site Builder Hub" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "סגירת ניווט" }).last()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect.poll(async () => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("17 confirmation dialog traps and returns focus", async ({ page }) => {
  await openScenario(page, "admin", "/sites/managed-ready?area=backups");
  const trigger = page.getByRole("button", { name: "יצירת גיבוי" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "יצירת גיבוי" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "ביטול" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect.poll(async () => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("18 theme switching works", async ({ page }) => {
  await openScenario(page, "admin", "/settings");
  await page.getByRole("button", { name: /^כהה/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /^בהיר/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("19 normal routes have no page-level horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/sites", "/sites/new", "/sites/managed-ready", "/sites/managed-ready?area=backups", "/operations", "/settings"]) {
    await openScenario(page, "admin", route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("20 partial API failure keeps core Site data usable", async ({ page }) => {
  await openScenario(page, "backups-fail", "/sites/managed-ready?area=backups");
  await expect(page.getByRole("heading", { level: 1, name: "פורטל מוכן" })).toBeVisible();
  await expect(page.getByText("חלק מהמידע החי לא זמין")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "אזורי האתר" })).toBeVisible();
});

test("21 mock creation starts and remains partial without claiming completion", async ({ page }) => {
  await openScenario(page, "partial-setup", "/sites/new");
  await fillSetupToReview(page);
  await page.getByRole("button", { name: "יצירת האתר" }).click();
  await expect(page.getByRole("button", { name: "יוצר..." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ההקמה נשמרה חלקית" })).toBeVisible();
  await expect(page.getByRole("link", { name: "המשך הקמה" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "האתר מוכן" })).toHaveCount(0);
});

test("22 partial setup resumes at the Create stage", async ({ page }) => {
  await openScenario(page, "partial-setup", "/sites/new?resume=managed-partial");
  await expect(page.getByRole("heading", { name: "ההקמה נשמרה חלקית" })).toBeVisible();
  await expect(page.getByRole("link", { name: "המשך הקמה" })).toBeVisible();
  await expect(page.locator('.normal-stepper li[aria-current="step"]')).toContainText("יצירה");
});

test("23 mock creation failure stays actionable", async ({ page }) => {
  await openScenario(page, "failed-setup", "/sites/new");
  await fillSetupToReview(page);
  await page.getByRole("button", { name: "יצירת האתר" }).click();
  await expect(page.getByRole("alert")).toContainText("יצירת האתר נכשלה בתרחיש הבדיקה");
  await expect(page.getByRole("button", { name: "יצירת האתר" })).toBeVisible();
});

test("24 Complete stage appears only after all known gates pass", async ({ page }) => {
  await openScenario(page, "complete-setup", "/sites/new");
  await fillSetupToReview(page);
  await page.getByRole("button", { name: "יצירת האתר" }).click();
  await expect(page.getByRole("heading", { name: "האתר מוכן" })).toBeVisible();
  await expect(page.locator('.normal-stepper li[aria-current="step"]')).toContainText("סיום");
});

test("25 cached backup data remains visible after a refresh failure", async ({ page }) => {
  await openScenario(page, "cached", "/sites/managed-ready?area=backups");
  await expect(page.getByText("גיבוי ניתן לשחזור").first()).toBeVisible();
  await page.getByRole("button", { name: "בדיקה עכשיו" }).click();
  await expect(page.getByText("חלק מהמידע החי לא זמין")).toBeVisible();
  await expect(page.getByText("גיבוי ניתן לשחזור").first()).toBeVisible();
});

test("26 no-data state remains recoverable", async ({ page }) => {
  await openScenario(page, "no-data", "/sites");
  await expect(page.getByRole("alert")).toContainText("לא ניתן לטעון את האתרים");
  await expect(page.getByRole("button", { name: "נסה שוב" })).toBeVisible();
});
