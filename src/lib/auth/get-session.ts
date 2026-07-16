import { auth, currentUser } from "@clerk/nextjs/server";
import type { User as ClerkUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prismaUnsafe } from "@/lib/prisma/client";
import type { UserModel as DbUser } from "@/generated/prisma/models";

export interface AuthContext {
  /** Clerk user id (e.g. `user_2abc...`). */
  userId: string;
  /** Tenant del usuario, derivado del User en DB. */
  tenantId: string;
  /**
   * Objeto crudo de Clerk. Solo se resuelve cuando hace falta (alta/vinculación
   * de un usuario aún no presente en la DB); en el camino normal es `null` para
   * evitar una petición extra al backend de Clerk en cada request.
   */
  user: ClerkUser | null;
  /** User de nuestra base. */
  dbUser: DbUser;
}

/**
 * Resuelve el AuthContext del request actual.
 *
 *  - Redirige a /sign-in si no hay sesión Clerk.
 *  - Vincula al User de la DB por clerkId.
 *  - Si no existe, intenta vincular por email (caso seed → primera sesión).
 *  - Si tampoco: en producción redirige a /cuenta-no-autorizada (fail-closed);
 *    en dev crea uno bajo el primer Tenant disponible con rol MASTER.
 *
 * Memoizada con React.cache para que layouts y pages compartan una sola
 * lookup por request.
 */
export const requireAuth = cache(async (): Promise<AuthContext> => {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Caso común: el usuario ya está vinculado por clerkId. En este camino NO
  // llamamos a currentUser() (una petición extra al backend de Clerk): es
  // innecesaria —auth() ya validó la sesión— y nos vuelve dependientes de la
  // disponibilidad de ese endpoint (un 500 de Clerk tumbaría cualquier página).
  let dbUser = await prismaUnsafe.user.findUnique({ where: { clerkId: userId } });

  // Solo cuando el usuario aún no existe en la DB resolvemos su perfil de Clerk
  // para vincularlo (backfill por email) o crearlo.
  let clerkUser: ClerkUser | null = null;
  if (!dbUser) {
    clerkUser = await currentUser();
    if (!clerkUser) {
      redirect("/sign-in");
    }
    // Alias const: el narrowing a no-nulo no sobrevive en closures sobre un `let`.
    const profile = clerkUser;

    const primaryEmail =
      profile.emailAddresses.find((e) => e.id === profile.primaryEmailAddressId)
        ?.emailAddress ?? profile.emailAddresses[0]?.emailAddress;

    // Backfill: si el seed creó al user con clerkId=null, y ahora ese mismo
    // email se autenticó por primera vez en Clerk, vinculamos la cuenta.
    if (primaryEmail) {
      const byEmail = await prismaUnsafe.user.findFirst({ where: { email: primaryEmail } });
      if (byEmail) {
        dbUser = await prismaUnsafe.user.update({
          where: { id: byEmail.id },
          data: { clerkId: userId },
        });
      }
    }

    // Ningún match por clerkId ni por email. En producción NUNCA se
    // auto-provisiona: el alta debe venir del seed o de una invitación
    // explícita — fail-closed (CLAUDE.md §4.1).
    if (!dbUser) {
      if (process.env["NODE_ENV"] === "production") {
        redirect("/cuenta-no-autorizada");
      }

      // Fallback dev: lo enganchamos al primer Tenant con rol MASTER para
      // poder operar la app.
      const firstTenant = await prismaUnsafe.tenant.findFirst({
        orderBy: { createdAt: "asc" },
      });
      if (!firstTenant) {
        throw new Error(
          "No hay Tenants en la base. Corre `pnpm db:seed` antes de autenticarte.",
        );
      }
      if (!primaryEmail) {
        throw new Error("La cuenta de Clerk no tiene email primario configurado.");
      }
      const fullName =
        `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() || "Usuario";
      const masterRoleId = (
        await prismaUnsafe.role.findUnique({ where: { code: "MASTER" } })
      )?.id;
      dbUser = await prismaUnsafe.user.create({
        data: {
          tenantId: firstTenant.id,
          clerkId: userId,
          email: primaryEmail,
          name: fullName,
          ...(masterRoleId
            ? { roles: { create: [{ roleId: masterRoleId }] } }
            : {}),
        },
      });
    }
  }

  return {
    userId,
    tenantId: dbUser.tenantId,
    user: clerkUser,
    dbUser,
  };
});
