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
  /** Objeto crudo de Clerk. */
  user: ClerkUser;
  /** User de nuestra base. */
  dbUser: DbUser;
}

/**
 * Resuelve el AuthContext del request actual.
 *
 *  - Redirige a /sign-in si no hay sesión Clerk.
 *  - Vincula al User de la DB por clerkId.
 *  - Si no existe, intenta vincular por email (caso seed → primera sesión).
 *  - Si tampoco, crea uno bajo el primer Tenant disponible (DEV ONLY —
 *    en prod entrará vía flujo de invitación; ver Prompt 4 en CLAUDE.md).
 *
 * Memoizada con React.cache para que layouts y pages compartan una sola
 * lookup por request.
 */
export const requireAuth = cache(async (): Promise<AuthContext> => {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const clerkUser = await currentUser();
  if (!clerkUser) {
    redirect("/sign-in");
  }

  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  let dbUser = await prismaUnsafe.user.findUnique({ where: { clerkId: userId } });

  // Backfill: si el seed creó al user con clerkId=null, y ahora ese mismo
  // email se autenticó por primera vez en Clerk, vinculamos la cuenta.
  if (!dbUser && primaryEmail) {
    const byEmail = await prismaUnsafe.user.findFirst({ where: { email: primaryEmail } });
    if (byEmail) {
      dbUser = await prismaUnsafe.user.update({
        where: { id: byEmail.id },
        data: { clerkId: userId },
      });
    }
  }

  // Fallback dev: ningún match. Lo enganchamos al primer Tenant.
  if (!dbUser) {
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
      `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || "Usuario";
    dbUser = await prismaUnsafe.user.create({
      data: {
        tenantId: firstTenant.id,
        clerkId: userId,
        email: primaryEmail,
        name: fullName,
      },
    });
  }

  return {
    userId,
    tenantId: dbUser.tenantId,
    user: clerkUser,
    dbUser,
  };
});
