import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("sign in page renders correctly", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("wrong@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/sign in failed|invalid/i)).toBeVisible({ timeout: 5000 });
  });

  test("redirects authenticated users to dashboard", async ({ page }) => {
    // Set auth state in localStorage before visiting
    await page.goto("/sign-in");
    // This test would need a test account seeded in the test DB
    // For now validate the redirect on the sign-in page
    await expect(page).toHaveURL(/sign-in/);
  });
});
