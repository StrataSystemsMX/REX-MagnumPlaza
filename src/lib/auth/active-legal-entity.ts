import { cookies } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

export const ACTIVE_LEGAL_ENTITY_COOKIE = "strata_active_legal_entity";

/**
 * Devuelve el id de la LegalEntity activa para el filtro global de la topbar.
 * `null` significa "Todas" (sin filtro). Valida que la entidad pertenezca al
 * tenant actual; si la cookie quedó apuntando a una LE de otro tenant o a una
 * inactiva, se ignora.
 */
export async function getActiveLegalEntityId(): Promise<string | null> {
  const { tenantId } = await requireAuth();
  const cookieStore = await cookies();
  const value = cookieStore.get(ACTIVE_LEGAL_ENTITY_COOKIE)?.value;
  if (!value) return null;

  const found = await prisma.legalEntity.findFirst({
    where: { id: value, tenantId, isActive: true },
    select: { id: true },
  });
  return found?.id ?? null;
}

/**
 * Helper para inyectar el filtro Owner-OR-Manager en queries de Property.
 * Devuelve `undefined` cuando no hay filtro activo (vista "Todas") para que el
 * caller pueda hacer spread sin condicionales.
 */
export function legalEntityPropertyFilter(
  legalEntityId: string | null,
): Pick<Prisma.PropertyWhereInput, "OR"> | Record<string, never> {
  if (!legalEntityId) return {};
  return {
    OR: [
      { ownerEntityId: legalEntityId },
      { managerEntityId: legalEntityId },
    ],
  };
}
