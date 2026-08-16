"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/get-session";
import { requireAuditRestore } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { logAudit } from "@/server/services/audit";
import { reversibilityOf } from "@/shared/audit/categories";
import {
  UNDO_HANDLERS,
  getDependentCounts,
  hasAnyDependents,
  type DependentCounts,
  type UndoImpact,
} from "@/server/services/audit-undo";
import { reconcileRentsForContract } from "@/server/services/rent-generation";
import type { AuditAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

// Rutas a revalidar por tipo de entidad afectada.
const REVALIDATE_PATHS: Record<string, string[]> = {
  Lessee: ["/lessees"],
  Property: ["/inmuebles", "/plazas", "/properties"],
  Unit: ["/inmuebles", "/plazas"],
  Contract: ["/contracts", "/collections"],
  Payment: ["/collections", "/ingresos"],
};

function getBefore(changes: unknown): Record<string, unknown> | null {
  if (typeof changes === "object" && changes !== null && !Array.isArray(changes)) {
    const b = (changes as Record<string, unknown>)["before"];
    if (typeof b === "object" && b !== null && !Array.isArray(b)) {
      return b as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * ¿Existe un AuditLog más nuevo para el mismo (entityType, entityId)? Solo se
 * puede deshacer el cambio más reciente — revertir uno viejo dejaría el
 * registro en un estado obsoleto ("valores que no cuadran").
 */
async function hasNewerChange(
  tenantId: string,
  entityType: string,
  entityId: string,
  createdAt: Date,
  excludeId: string,
): Promise<boolean> {
  const newer = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      entityType,
      entityId,
      id: { not: excludeId },
      action: { in: ["CREATE", "UPDATE", "DELETE", "RESTORE"] },
      createdAt: { gt: createdAt },
    },
    select: { id: true },
  });
  return newer !== null;
}

const STALE_REASON =
  "Hay un cambio más reciente sobre este registro. Deshace primero el más reciente.";

/** Previsualiza el impacto de deshacer un cambio (para decidir el aviso). */
export async function actionGetUndoImpact(auditLogId: string): Promise<UndoImpact> {
  const { tenantId, dbUser } = await requireAuth();
  await requireAuditRestore(dbUser.id);

  const log = await prisma.auditLog.findFirst({ where: { id: auditLogId, tenantId } });
  if (!log) {
    return { reversible: false, reason: "Movimiento no encontrado.", danger: false };
  }

  const rev = reversibilityOf({
    action: log.action,
    entityType: log.entityType,
    changes: log.changes,
  });
  if (!rev.reversible) return { reversible: false, reason: rev.reason, danger: false };

  if (await hasNewerChange(tenantId, log.entityType, log.entityId, log.createdAt, log.id)) {
    return { reversible: false, reason: STALE_REASON, danger: false };
  }

  // Solo la cascada de una creación puede borrar registros importantes.
  if (log.action === "CREATE") {
    const dependents = await getDependentCounts(log.entityType, tenantId, log.entityId);
    if (hasAnyDependents(dependents)) {
      return { reversible: true, danger: true, dependents: dependents ?? undefined };
    }
  }
  return { reversible: true, danger: false };
}

/** Cuenta dependientes de un sujeto — para el aviso de los botones Eliminar. */
export async function actionCountSubjectDependents(
  entityType: string,
  id: string,
): Promise<DependentCounts> {
  const { tenantId } = await requireAuth();
  const counts = await getDependentCounts(entityType, tenantId, id);
  return counts ?? {};
}

/**
 * Deshace un cambio: revierte una edición, deshace una creación (borrando su
 * subárbol en cascada) o restaura un borrado lógico. Todo en una transacción.
 * El historial nunca se edita: el "deshacer" se registra como movimiento nuevo.
 */
export async function actionUndoChange(auditLogId: string): Promise<void> {
  const { tenantId, dbUser } = await requireAuth();
  await requireAuditRestore(dbUser.id);

  const log = await prisma.auditLog.findFirst({ where: { id: auditLogId, tenantId } });
  if (!log) throw new Error("Movimiento no encontrado.");

  const rev = reversibilityOf({
    action: log.action,
    entityType: log.entityType,
    changes: log.changes,
  });
  if (!rev.reversible) throw new Error(rev.reason);

  if (await hasNewerChange(tenantId, log.entityType, log.entityId, log.createdAt, log.id)) {
    throw new Error(STALE_REASON);
  }

  const handler = UNDO_HANDLERS[log.entityType];
  if (!handler) throw new Error("Tipo de cambio no reversible.");

  const now = new Date();

  // Snapshot forense de lo que se borrará (red de seguridad para la cascada).
  let deletedSnapshot: DependentCounts | null = null;
  if (log.action === "CREATE") {
    deletedSnapshot = await getDependentCounts(log.entityType, tenantId, log.entityId);
  }

  let reconcileContractId: string | undefined;

  await prisma.$transaction(async (tx) => {
    switch (log.action) {
      case "CREATE": {
        if (!handler.cascadeDelete) throw new Error("No se puede deshacer esta creación.");
        await handler.cascadeDelete(tx, tenantId, log.entityId, now);
        break;
      }
      case "UPDATE": {
        if (!handler.revert) throw new Error("No se puede revertir esta edición.");
        const before = getBefore(log.changes);
        if (!before) throw new Error("Sin estado previo guardado para revertir.");
        const r = await handler.revert(tx, tenantId, log.entityId, before);
        reconcileContractId = r.reconcileContractId;
        break;
      }
      case "DELETE": {
        if (!handler.restore) throw new Error("No se puede restaurar este registro.");
        const ok = await handler.restore(tx, tenantId, log.entityId);
        if (!ok) throw new Error("El registro ya no existe o ya fue restaurado.");
        break;
      }
      default:
        throw new Error("Esta acción no se puede deshacer.");
    }
  });

  // Reconciliación de rentas fuera de la tx (igual que el update normal).
  if (reconcileContractId) {
    await reconcileRentsForContract(tenantId, reconcileContractId);
  }

  // El "deshacer" se registra como un movimiento nuevo (historial inmutable).
  const undoAction: AuditAction = log.action === "CREATE" ? "DELETE" : "RESTORE";
  await logAudit({
    tenantId,
    userId: dbUser.id,
    action: undoAction,
    entityType: log.entityType,
    entityId: log.entityId,
    changes: {
      undoOf: log.id,
      undoneAction: log.action,
      ...(deletedSnapshot ? { deleted: deletedSnapshot } : {}),
    } as unknown as Prisma.InputJsonValue,
  });

  for (const p of REVALIDATE_PATHS[log.entityType] ?? []) revalidatePath(p);
  revalidatePath("/historial");
}
