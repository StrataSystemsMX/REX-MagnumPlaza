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

const SOFT_DELETE_ENTITIES = new Set<string>(["Lessee", "Property", "Unit"]);

export type Reversibility =
  | { reversible: true }
  | { reversible: false; reason: string };

export interface AuditEntryLike {
  action: AuditAction;
  entityType: string;
  changes: unknown;
}

function isSoftDeleteChange(changes: unknown): boolean {
  return (
    typeof changes === "object" &&
    changes !== null &&
    !Array.isArray(changes) &&
    (changes as Record<string, unknown>)["soft"] === true
  );
}

export function reversibilityOf(entry: AuditEntryLike): Reversibility {
  if (entry.action === "RESTORE") {
    return { reversible: false, reason: "Ya es una restauración." };
  }
  if (entry.action !== "DELETE") {
    return { reversible: false, reason: "Sólo las eliminaciones se pueden deshacer." };
  }
  if (!SOFT_DELETE_ENTITIES.has(entry.entityType)) {
    return {
      reversible: false,
      reason: "Eliminación permanente: no se puede restaurar.",
    };
  }
  if (!isSoftDeleteChange(entry.changes)) {
    return { reversible: false, reason: "No es una eliminación reversible." };
  }
  return { reversible: true };
}

export function isReversible(entry: AuditEntryLike): boolean {
  return reversibilityOf(entry).reversible;
}
