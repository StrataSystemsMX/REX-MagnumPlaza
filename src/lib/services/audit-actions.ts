"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-session";
import { requireAuditRestore } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { logAudit } from "@/lib/services/audit";
import { reversibilityOf } from "@/lib/audit/categories";

// Rutas a revalidar tras restaurar, por tipo de entidad.
const REVALIDATE_PATHS: Record<string, string[]> = {
  Lessee: ["/lessees"],
  Property: ["/inmuebles", "/plazas", "/properties"],
  Unit: ["/inmuebles", "/plazas"],
};

/** Reactiva (deshace el borrado lógico) el registro destino. true si existía. */
async function reactivate(
  entityType: string,
  id: string,
  tenantId: string,
): Promise<boolean> {
  switch (entityType) {
    case "Lessee": {
      const r = await prisma.lessee.updateMany({
        where: { id, tenantId },
        data: { isActive: true },
      });
      return r.count > 0;
    }
    case "Property": {
      const r = await prisma.property.updateMany({
        where: { id, tenantId },
        data: { isActive: true },
      });
      return r.count > 0;
    }
    case "Unit": {
      const r = await prisma.unit.updateMany({
        where: { id, tenantId },
        data: { isActive: true },
      });
      return r.count > 0;
    }
    default:
      return false;
  }
}

/**
 * Deshace un cambio del historial. Sólo soporta restaurar borrados lógicos
 * (Inquilino/Inmueble/Unidad). La restauración queda registrada como un nuevo
 * AuditLog con acción RESTORE — el historial nunca se edita ni se borra.
 */
export async function actionUndoChange(auditLogId: string): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requireAuditRestore(dbUser.id);

  const log = await prisma.auditLog.findFirst({
    where: { id: auditLogId, tenantId },
  });
  if (!log) throw new Error("Movimiento no encontrado.");

  const rev = reversibilityOf({
    action: log.action,
    entityType: log.entityType,
    changes: log.changes,
  });
  if (!rev.reversible) throw new Error(rev.reason);

  const restored = await reactivate(log.entityType, log.entityId, tenantId);
  if (!restored) {
    throw new Error("El registro ya no existe o ya fue restaurado.");
  }

  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: "RESTORE",
    entityType: log.entityType,
    entityId: log.entityId,
    changes: { restoredFrom: auditLogId },
  });

  for (const p of REVALIDATE_PATHS[log.entityType] ?? []) revalidatePath(p);
  revalidatePath("/historial");
}
