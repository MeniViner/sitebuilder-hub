import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const scenarioUrl = (scenario: string, route: string) => `/?scenario=${encodeURIComponent(scenario)}#${route}`;

async function openReady(page: Page, scenario: string, route: string) {
  await page.goto(scenarioUrl(scenario, route));
  await expect(page.locator("#main-content").getByRole("heading").first()).toBeVisible();
}

async function expectNoAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
}

test("27 normal Admin routes have no automated WCAG A/AA violations", async ({ page }) => {
  for (const route of ["/", "/sites", "/sites/new", "/sites/managed-ready", "/sites/managed-ready?area=access", "/sites/managed-ready?area=backups", "/operations", "/settings"]) {
    await openReady(page, "admin", route);
    await expectNoAxeViolations(page);
  }
});

test("28 Viewer routes pass the same automated checks in Dark mode", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("sitebuilder-hub-theme", "dark"));
  for (const route of ["/", "/sites", "/sites/managed-ready", "/operations", "/settings"]) {
    await openReady(page, "viewer", route);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoAxeViolations(page);
  }
});

test("29 mobile navigation and confirmation dialog pass automated checks", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReady(page, "admin", "/");
  await page.getByRole("button", { name: "פתיחת ניווט" }).click();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");

  await openReady(page, "admin", "/sites/managed-ready?area=backups");
  await page.getByRole("button", { name: "יצירת גיבוי" }).click();
  await expectNoAxeViolations(page);
});
