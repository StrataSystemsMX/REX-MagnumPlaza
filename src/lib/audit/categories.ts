import type { AuditAction } from "@/generated/prisma/enums";

// =============================================================================
// Categorías de auditoría
// -----------------------------------------------------------------------------
// Módulo PURO (sin Prisma): se importa tanto en el servidor (queries) como en
// el cliente (vista del historial). No agregar imports server-only aquí.
// =============================================================================

export type AuditCategory =
  | "INGRESOS"
  | "EGRESOS"
  | "INQUILINOS"
  | "CONTRATOS"
  | "INMUEBLES"
  | "MANTENIMIENTO"
  | "OTROS";

/** Orden en que se ofrecen las categorías en el filtro. */
export const AUDIT_CATEGORIES: readonly AuditCategory[] = [
  "INGRESOS",
  "EGRESOS",
  "INQUILINOS",
  "CONTRATOS",
  "INMUEBLES",
  "MANTENIMIENTO",
  "OTROS",
];

/** `entityType` (tal como se guarda en AuditLog) → categoría de negocio. */
export const ENTITY_CATEGORY: Record<string, AuditCategory> = {
  Payment: "INGRESOS",
  Rent: "INGRESOS",
  Expense: "EGRESOS",
  Payroll: "EGRESOS",
  CadastralPayment: "EGRESOS",
  Lessee: "INQUILINOS",
  Contract: "CONTRATOS",
  Guarantee: "CONTRATOS",
  Document: "CONTRATOS",
  Property: "INMUEBLES",
  Unit: "INMUEBLES",
  Maintenance: "MANTENIMIENTO",
  NotificationLog: "OTROS",
  Tenant: "OTROS",
};

export function categoryOf(entityType: string): AuditCategory {
  return ENTITY_CATEGORY[entityType] ?? "OTROS";
}

export function auditCategoryLabel(c: AuditCategory): string {
  switch (c) {
    case "INGRESOS":
      return "Ingresos";
    case "EGRESOS":
      return "Egresos";
    case "INQUILINOS":
      return "Inquilinos";
    case "CONTRATOS":
      return "Contratos";
    case "INMUEBLES":
      return "Inmuebles";
    case "MANTENIMIENTO":
      return "Mantenimiento";
    case "OTROS":
      return "Otros";
  }
}

/** `entityType`s que pertenecen a una categoría — para filtrar la query. */
export function entityTypesForCategory(c: AuditCategory): string[] {
  return Object.keys(ENTITY_CATEGORY).filter((k) => ENTITY_CATEGORY[k] === c);
}

/** Etiqueta singular y legible de la entidad (columna "Tipo" y frases de detalle). */
const ENTITY_LABEL: Record<string, string> = {
  Payment: "Pago",
  Rent: "Cargo de renta",
  Expense: "Egreso",
  Payroll: "Nómina",
  CadastralPayment: "Predial",
  Lessee: "Inquilino",
  Contract: "Contrato",
  Guarantee: "Garantía",
  Document: "Documento",
  Property: "Inmueble",
  Unit: "Unidad",
  Maintenance: "Mantenimiento",
  NotificationLog: "Notificación",
  Tenant: "Configuración",
};

export function entityTypeLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? entityType;
}

// -----------------------------------------------------------------------------
// Reversibilidad
// -----------------------------------------------------------------------------
// "Deshacer" sólo restaura borrados lógicos (isActive=false) de Inquilino,
// Inmueble y Unidad. El resto no es reversible: los logs guardan únicamente el
// estado posterior (`after`), no el anterior, y otros borrados son físicos.
// =============================================================================

export type Reversibility =
  | { reversible: true }
  | { reversible: false; reason: string };

export interface AuditEntryLike {
  action: AuditAction;
  entityType: string;
  changes: unknown;
}

export interface UndoCapabilities {
  /** La edición (UPDATE) se puede revertir (requiere `before` en el log). */
  revert?: boolean;
  /** La creación (CREATE) se puede deshacer borrando el subárbol en cascada. */
  cascadeDelete?: boolean;
  /** El borrado lógico (DELETE soft) se puede restaurar. */
  restore?: boolean;
}

/**
 * Qué se puede deshacer por tipo de entidad. DEBE mantenerse alineado con
 * `UNDO_HANDLERS` en [src/lib/services/audit-undo.ts]. Vive aquí (módulo puro)
 * para que el botón decida habilitado/deshabilitado sin tocar el servidor.
 */
export const UNDO_CAPABILITIES: Record<string, UndoCapabilities> = {
  Lessee: { revert: true, cascadeDelete: true, restore: true },
  Property: { revert: true, cascadeDelete: true, restore: true },
  Unit: { revert: true, cascadeDelete: true, restore: true },
  Contract: { revert: true, cascadeDelete: true },
  Payment: { revert: true, cascadeDelete: true },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSoftDeleteChange(changes: unknown): boolean {
  return isRecord(changes) && changes["soft"] === true;
}

function hasBefore(changes: unknown): boolean {
  return isRecord(changes) && isRecord(changes["before"]);
}

export function reversibilityOf(entry: AuditEntryLike): Reversibility {
  const caps = UNDO_CAPABILITIES[entry.entityType];
  if (!caps) {
    return { reversible: false, reason: "Este tipo de cambio no se puede deshacer." };
  }
  switch (entry.action) {
    case "CREATE":
      return caps.cascadeDelete
        ? { reversible: true }
        : {
            reversible: false,
            reason: "No se puede deshacer la creación de este registro.",
          };
    case "UPDATE":
      if (!caps.revert) {
        return {
          reversible: false,
          reason: "Las ediciones de este registro no se pueden deshacer.",
        };
      }
      if (!hasBefore(entry.changes)) {
        return {
          reversible: false,
          reason: "Sin estado previo guardado (cambio anterior a esta función).",
        };
      }
      return { reversible: true };
    case "DELETE":
      if (!caps.restore) {
        return {
          reversible: false,
          reason: "Eliminación permanente: no se puede restaurar.",
        };
      }
      if (!isSoftDeleteChange(entry.changes)) {
        return { reversible: false, reason: "No es una eliminación reversible." };
      }
      return { reversible: true };
    case "RESTORE":
      return { reversible: false, reason: "Ya es una restauración." };
    default:
      return { reversible: false, reason: "Esta acción no se puede deshacer." };
  }
}

export function isReversible(entry: AuditEntryLike): boolean {
  return reversibilityOf(entry).reversible;
}
