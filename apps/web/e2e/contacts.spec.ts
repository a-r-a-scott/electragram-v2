import { test, expect } from "@playwright/test";

test.describe("Contacts", () => {
  test.beforeEach(async ({ page }) => {
    // In a real test, authenticate first
    // await authenticateAsTestUser(page);
    await page.goto("/dashboard/contacts");
  });

  test("contacts page shows the contacts table", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Contact" })).toBeVisible();
  });
});
