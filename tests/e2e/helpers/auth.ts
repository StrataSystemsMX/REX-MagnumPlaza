import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * Inicia sesión con el usuario E2E vía Clerk Testing Tokens (sin UI de Clerk,
 * sin captcha). Requiere en el entorno:
 *   - E2E_CLERK_USER_EMAIL     (usuario existente en la instancia dev de Clerk)
 *   - E2E_CLERK_USER_PASSWORD
 *
 * En dev, requireAuth auto-provisiona al usuario en la DB local con rol
 * MASTER en su primer login (fallback de desarrollo), así que no hace falta
 * sembrarlo en Postgres.
 */
export async function signInAsMaster(page: Page): Promise<void> {
  const identifier = process.env["E2E_CLERK_USER_EMAIL"];
  const password = process.env["E2E_CLERK_USER_PASSWORD"];
  if (!identifier || !password) {
    throw new Error(
      "Faltan E2E_CLERK_USER_EMAIL / E2E_CLERK_USER_PASSWORD en el entorno. " +
        "Ver tests/e2e/README.md.",
    );
  }

  await setupClerkTestingToken({ page });
  // clerk.signIn necesita que ClerkJS esté cargado: navegar primero a la app.
  await page.goto("/sign-in");
  await clerk.signIn({
    page,
    signInParams: { strategy: "password", identifier, password },
  });
  await page.goto("/");
}
