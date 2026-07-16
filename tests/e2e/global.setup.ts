import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Global setup de Playwright: obtiene un Testing Token de Clerk (bypassa la
 * protección anti-bot) usando CLERK_SECRET_KEY + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * del entorno. Requiere que esas llaves sean de una instancia de DESARROLLO.
 *
 * GUARD DE SEGURIDAD: los E2E crean contratos y pagos reales. Nunca deben
 * correr contra la base de producción (Supabase) — exige una DB local.
 */
export default async function globalSetup(): Promise<void> {
  const dbUrl = process.env["DATABASE_URL"] ?? "";
  if (dbUrl.includes("supabase.co")) {
    throw new Error(
      "E2E bloqueado: DATABASE_URL apunta a Supabase (producción). " +
        "Usa una base LOCAL para los E2E — ver tests/e2e/README.md.",
    );
  }

  const secretKey = process.env["CLERK_SECRET_KEY"] ?? "";
  if (secretKey.startsWith("sk_live_")) {
    throw new Error(
      "E2E bloqueado: CLERK_SECRET_KEY es de producción (sk_live_). " +
        "Usa las llaves de la instancia de desarrollo de Clerk.",
    );
  }

  await clerkSetup();
}
