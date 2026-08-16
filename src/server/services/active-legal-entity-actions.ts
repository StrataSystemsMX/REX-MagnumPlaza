"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/get-session";
import { prisma } from "@/server/prisma/client";
import { ACTIVE_LEGAL_ENTITY_COOKIE } from "@/server/auth/active-legal-entity";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Cambia la LegalEntity activa para el filtro global del topbar.
 * `null` limpia la cookie (vuelve a vista "Todas"). Valida la membresía al
 * tenant antes de escribir para evitar que un usuario apunte a una LE ajena.
 */
export async function actionSetActiveLegalEntity(
  legalEntityId: string | null,
): Promise<void> {
  const { tenantId } = await requireAuth();
  const cookieStore = await cookies();

  if (legalEntityId === null) {
    cookieStore.delete(ACTIVE_LEGAL_ENTITY_COOKIE);
  } else {
    const exists = await prisma.legalEntity.findFirst({
      where: { id: legalEntityId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!exists) {
      throw new Error("Razón social no válida.");
    }
    cookieStore.set(ACTIVE_LEGAL_ENTITY_COOKIE, legalEntityId, {
      maxAge: COOKIE_MAX_AGE,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  revalidatePath("/", "layout");
}
