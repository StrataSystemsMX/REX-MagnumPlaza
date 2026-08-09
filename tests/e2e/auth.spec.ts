import { expect, test } from "@playwright/test";
import { signInAsMaster } from "./helpers/auth";

test.describe("Autenticación", () => {
  test("sin sesión redirige a /sign-in", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/sign-in/);
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("login con Clerk llega al dashboard", async ({ page }) => {
    await signInAsMaster(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible();
    // Topbar global presente (marca de sesión activa).
    await expect(page.getByRole("button", { name: /abrir menú|open menu/i }).or(
      page.getByPlaceholder(/buscar/i),
    ).first()).toBeVisible();
  });
});
