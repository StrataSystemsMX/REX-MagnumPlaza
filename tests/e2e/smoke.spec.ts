import { expect, test } from "@playwright/test";
import { signInAsMaster } from "./helpers/auth";

/**
 * Smoke de navegación autenticada: las páginas núcleo del dashboard cargan
 * y renderizan su encabezado (atrapa errores de server components, permisos
 * mal gateados y crashes de data-fetching con la DB sembrada).
 */
test.describe("Navegación autenticada", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMaster(page);
  });

  test("Cobranza carga", async ({ page }) => {
    await page.goto("/collections");
    await expect(
      page.getByRole("heading", { level: 1, name: "Cobranza" }),
    ).toBeVisible();
  });

  test("Contratos carga", async ({ page }) => {
    await page.goto("/contracts");
    await expect(
      page.getByRole("heading", { level: 1, name: "Contratos" }),
    ).toBeVisible();
  });

  test("Propiedades carga", async ({ page }) => {
    await page.goto("/plazas");
    await expect(
      page.getByRole("heading", { level: 1, name: "Propiedades" }),
    ).toBeVisible();
  });

  test("Ingresos (matriz anual) carga", async ({ page }) => {
    await page.goto("/ingresos");
    await expect(page.getByText("Desglose por razón social")).toBeVisible();
  });
});
