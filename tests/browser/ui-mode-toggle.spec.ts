import { expect, test, type Page } from "@playwright/test";

const scenarioUrl = (scenario: string, route = "/", ui?: "modern" | "legacy") => {
  const params = new URLSearchParams({ scenario });
  if (ui) params.set("ui", ui);
  return `/?${params.toString()}#${route}`;
};

async function openScenario(page: Page, {
  scenario = "admin",
  route = "/",
  ui
}: {
  scenario?: string;
  route?: string;
  ui?: "modern" | "legacy";
} = {}) {
  await page.goto(scenarioUrl(scenario, route, ui));
  await expect(page.locator("#main-content").getByRole("heading").first()).toBeVisible();
}

async function expectMode(page: Page, mode: "modern" | "legacy") {
  await expect(page.locator("html")).toHaveAttribute("data-hub-ui-mode", mode);
  await expect(page.locator(`[data-hub-shell="${mode}"]`)).toBeVisible();
}

test("31 modern is default and keyboard switching renders the exact legacy shell and returns", async ({ page }) => {
  await openScenario(page);
  await expectMode(page, "modern");
  await expect(page.getByRole("heading", { level: 1, name: "לוח בקרה" })).toBeVisible();

  const legacyButton = page.getByRole("button", { name: "תצוגה ישנה" });
  await expect(legacyButton).toHaveAttribute("aria-pressed", "false");
  await legacyButton.focus();
  await page.keyboard.press("Enter");

  await expectMode(page, "legacy");
  await expect(page.getByRole("heading", { level: 1, name: "לוח בקרה" })).toBeVisible();
  const modernButton = page.getByRole("button", { name: "חזרה לתצוגה החדשה" });
  await expect(modernButton).toHaveAttribute("aria-pressed", "true");
  await expect(modernButton).toBeFocused();
  await page.keyboard.press("Space");

  await expectMode(page, "modern");
  await expect(page.getByRole("button", { name: "תצוגה ישנה" })).toBeFocused();
});

test("32 preference survives refresh and explicit URL overrides do not corrupt it", async ({ page }) => {
  await openScenario(page, { route: "/sites" });
  await page.getByRole("button", { name: "תצוגה ישנה" }).click();
  await expectMode(page, "legacy");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("sitebuilder-hub-ui-mode"))).toBe("legacy");

  await page.reload();
  await expectMode(page, "legacy");

  await openScenario(page, { route: "/sites", ui: "modern" });
  await expectMode(page, "modern");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("sitebuilder-hub-ui-mode"))).toBe("legacy");

  await page.evaluate(() => localStorage.setItem("sitebuilder-hub-ui-mode", "modern"));
  await openScenario(page, { route: "/sites", ui: "legacy" });
  await expectMode(page, "legacy");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("sitebuilder-hub-ui-mode"))).toBe("modern");

  await page.goto("/?scenario=admin#/sites?ui=legacy");
  await expectMode(page, "legacy");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("sitebuilder-hub-ui-mode"))).toBe("modern");
  await page.getByRole("button", { name: "חזרה לתצוגה החדשה" }).click();
  await expectMode(page, "modern");
  expect(await page.evaluate(() => window.location.hash)).toBe("#/sites");
});

test("33 switching preserves every primary route, Site ID, and workspace query", async ({ page }) => {
  for (const route of ["/", "/sites", "/sites/new", "/operations", "/settings"]) {
    await openScenario(page, { route });
    const initialHash = await page.evaluate(() => window.location.hash);
    await page.getByRole("button", { name: "תצוגה ישנה" }).click();
    await expectMode(page, "legacy");
    expect(await page.evaluate(() => window.location.hash)).toBe(initialHash);
    await expect(page.getByText("העמוד אינו פעיל במצב הנוכחי")).toHaveCount(0);
    await page.getByRole("button", { name: "חזרה לתצוגה החדשה" }).click();
    await expectMode(page, "modern");
    expect(await page.evaluate(() => window.location.hash)).toBe(initialHash);
  }

  await openScenario(page, { route: "/sites/managed-ready?area=backups" });
  const siteHash = await page.evaluate(() => window.location.hash);
  await page.getByRole("button", { name: "תצוגה ישנה" }).click();
  await expectMode(page, "legacy");
  expect(await page.evaluate(() => window.location.hash)).toBe(siteHash);
  await expect(page.getByRole("heading", { level: 1, name: "פורטל מוכן" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "אזורי האתר" }).getByRole("button", { name: "גיבויים" })).toHaveAttribute("aria-current", "page");
});

test("34 Admin and Viewer retain their role behavior in both views", async ({ page }) => {
  for (const ui of ["modern", "legacy"] as const) {
    await openScenario(page, { scenario: "admin", route: "/sites", ui });
    await expect(page.getByRole("link", { name: "יצירת אתר" })).toBeVisible();

    await openScenario(page, { scenario: "viewer", route: "/sites", ui });
    await expect(page.getByRole("link", { name: "יצירת אתר" })).toHaveCount(0);
    await openScenario(page, { scenario: "viewer", route: "/sites/managed-ready", ui });
    await expect(page.getByRole("button", { name: "בדיקה עכשיו" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: ui === "legacy" ? "חזרה לתצוגה החדשה" : "תצוגה ישנה" })).toBeVisible();
  }
});

test("35 mobile sheets expose the switch, keep focus contained, and restore the menu trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openScenario(page);
  const modernMenu = page.getByRole("button", { name: "פתיחת ניווט" });
  await modernMenu.click();
  const modernDialog = page.getByRole("dialog", { name: "Site Builder Hub" });
  const legacyButton = modernDialog.getByRole("button", { name: "תצוגה ישנה" });
  await expect(legacyButton).toBeVisible();
  await legacyButton.focus();
  await page.keyboard.press("Enter");

  await expectMode(page, "legacy");
  const legacyMenu = page.getByRole("button", { name: "פתיחת ניווט" });
  await expect(legacyMenu).toBeFocused();
  await legacyMenu.click();
  const legacyDialog = page.getByRole("dialog", { name: "Site Builder Hub" });
  const modernButton = legacyDialog.getByRole("button", { name: "חזרה לתצוגה החדשה" });
  await modernButton.focus();
  await page.keyboard.press("Shift+Tab");
  await expect.poll(async () => legacyDialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await modernButton.focus();
  await page.keyboard.press("Space");

  await expectMode(page, "modern");
  await expect(page.getByRole("button", { name: "פתיחת ניווט" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
