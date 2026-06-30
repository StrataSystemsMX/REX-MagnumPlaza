import type {
  AuditAction,
  ContractStatus,
  ContractType,
} from "@/generated/prisma/enums";
import {
  auditActionLabel,
  contractStatusLabel,
  contractTypeLabel,
} from "@/lib/i18n/enums";
import { capitalizeFirst } from "@/lib/utils";
import { entityTypeLabel, type AuditEntryLike } from "@/lib/audit/categories";
import { DATE_KEYS, MONEY_KEYS } from "@/lib/audit/field-types";

// =============================================================================
// Detalle legible de auditoría
// -----------------------------------------------------------------------------
// Convierte el `changes` (JSON crudo) de un AuditLog en una frase en español.
// Módulo PURO (sin Prisma): se usa en el cliente (vista del historial y la
// pestaña "Auditoría" del detalle de contrato). Generaliza lo que antes vivía
// sólo para contratos en ContractDetailTabs.tsx.
// =============================================================================

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "long",
  day: "2-digit",
  timeZone: "UTC",
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fmtDate(v: unknown): string {
  if (typeof v !== "string") return String(v ?? "—");
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : capitalizeFirst(DATE.format(d));
}

function fmtMoney(v: unknown): string {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isNaN(n) ? String(v) : MXN.format(n);
}

function safeContractType(v: unknown): string {
  try {
    return contractTypeLabel(v as ContractType);
  } catch {
    return String(v);
  }
}

function safeContractStatus(s: string): string {
  try {
    return contractStatusLabel(s as ContractStatus);
  } catch {
    return s;
  }
}

// IDs internos y llaves técnicas que no aportan nada al lector.
const HIDDEN_KEYS = new Set<string>([
  "id",
  "tenantId",
  "unitId",
  "lesseeId",
  "contractId",
  "rentId",
  "categoryId",
  "propertyId",
  "legalEntityId",
  "parentUnitId",
  "ownerEntityId",
  "managerEntityId",
]);

const BOOL_LABELS: Record<string, string> = {
  autoRenew: "Auto-renovación",
  paidInAdvance: "Pago adelantado",
  isNotRequired: "Sin egreso",
  isPaid: "Pagado",
};

const TEXT_LABELS: Record<string, string> = {
  legalName: "Razón social",
  contactName: "Contacto",
  name: "Nombre",
  code: "Código",
  rfc: "RFC",
  phone: "Teléfono",
  whatsapp: "WhatsApp",
  email: "Correo",
  description: "Descripción",
  vendor: "Proveedor",
  invoiceNumber: "Factura",
  reference: "Referencia",
  paymentDay: "Día de pago",
};

/** Describe un campo del bloque `after`. Devuelve null para ocultarlo. */
function describeField(entityType: string, key: string, value: unknown): string | null {
  if (HIDDEN_KEYS.has(key)) return null;
  if (key === "notes") return value ? "Notas actualizadas" : null;
  if (key === "isActive") return null;

  if (key === "type" && entityType === "Contract") {
    return `Tipo: ${safeContractType(value)}`;
  }
  if (key === "lateFeePercentage") {
    return value == null ? null : `Interés moratorio: ${String(value)}%`;
  }
  if (key in BOOL_LABELS) {
    return `${BOOL_LABELS[key]}: ${value ? "Sí" : "No"}`;
  }
  if (MONEY_KEYS.has(key)) return `${TEXT_LABELS[key] ?? "Monto"}: ${fmtMoney(value)}`;
  if (DATE_KEYS.has(key)) return `${labelForDate(key)}: ${fmtDate(value)}`;
  if (key in TEXT_LABELS) {
    return value ? `${TEXT_LABELS[key]}: ${String(value)}` : null;
  }
  return null; // llaves desconocidas: se ocultan para no meter ruido.
}

function labelForDate(key: string): string {
  switch (key) {
    case "startDate":
      return "Inicio";
    case "endDate":
      return "Fin";
    case "expenseDate":
    case "paymentDate":
      return "Fecha";
    case "receivedDate":
      return "Recibido";
    case "returnedDate":
      return "Devuelto";
    case "advancePaidUntil":
      return "Pagado hasta";
    case "signedDate":
      return "Firmado";
    default:
      return "Fecha";
  }
}

function summarizeAfter(entityType: string, after: Record<string, unknown>): string[] {
  return Object.entries(after)
    .map(([k, v]) => describeField(entityType, k, v))
    .filter((s): s is string => s !== null);
}

/** Transiciones y renovaciones específicas de Contract. null si no aplica. */
function describeContract(c: Record<string, unknown>): string | null {
  if (isRecord(c.transition)) {
    const to = String(c.transition.to ?? "");
    if (to === "ACTIVE") {
      const n = typeof c.rentsCreated === "number" ? c.rentsCreated : null;
      return n !== null
        ? `Activó el contrato y generó ${n} ${n === 1 ? "cargo mensual" : "cargos mensuales"} de renta.`
        : "Activó el contrato.";
    }
    if (to === "TERMINATED") {
      const date = c.terminationDate ? ` el ${fmtDate(c.terminationDate)}` : "";
      const reason =
        typeof c.reason === "string" && c.reason ? ` — motivo: ${c.reason}` : "";
      return `Terminó el contrato anticipadamente${date}${reason}.`;
    }
    if (to === "CANCELLED") return "Canceló el contrato.";
    const from = String(c.transition.from ?? "");
    return `Cambió el estado de ${safeContractStatus(from)} a ${safeContractStatus(to)}.`;
  }

  if (typeof c.renewedFrom === "string") {
    const parts: string[] = [];
    if (c.newEndDate) parts.push(`nueva vigencia hasta ${fmtDate(c.newEndDate)}`);
    if (c.newAmount != null) parts.push(`renta ${fmtMoney(c.newAmount)}`);
    return `Renovó el contrato${parts.length ? ` — ${parts.join(", ")}` : ""}.`;
  }

  return null;
}

/** Marcadores de acción guardados dentro de `changes.action`. null si no aplica. */
function describeMarker(marker: string, noun: string): string | null {
  switch (marker) {
    case "REGISTER":
    case "REGISTER_PAYMENT":
      return `Registró el pago de ${noun}.`;
    case "UNMARK_PAID":
    case "UNMARK_PAYMENT":
      return `Quitó la marca de pagado de ${noun}.`;
    case "MARK_NOT_REQUIRED":
      return `Marcó ${noun} como "sin egreso".`;
    case "UNMARK_NOT_REQUIRED":
      return `Quitó "sin egreso" de ${noun}.`;
    case "RETURN":
      return "Devolvió la garantía.";
    default:
      return null;
  }
}

/** Frase de respaldo cuando no hay detalle estructurado. */
function fallback(action: AuditAction, noun: string): string {
  return `${auditActionLabel(action)} ${noun}.`;
}

/**
 * Traduce el metadata de un movimiento de auditoría a una frase en español.
 * Reúsalo desde la vista global del historial y desde el detalle de contrato.
 */
export function describeAuditDetail(entry: AuditEntryLike): string {
  const { action, entityType } = entry;
  const noun = entityTypeLabel(entityType).toLowerCase();
  const c = entry.changes;

  if (!isRecord(c)) return fallback(action, noun);

  if (c.soft === true) return `Eliminó ${noun}.`;
  if (c.auto === true) return `Creó automáticamente ${noun}.`;

  if (entityType === "Contract") {
    const detail = describeContract(c);
    if (detail) return detail;
  }

  if (typeof c.action === "string") {
    const marker = describeMarker(c.action, noun);
    if (marker) return marker;
  }

  if (isRecord(c.after)) {
    const parts = summarizeAfter(entityType, c.after);
    if (action === "CREATE") {
      return parts.length ? `Creó ${noun} — ${parts.join(" · ")}.` : `Creó ${noun}.`;
    }
    return parts.length
      ? `Actualizó ${noun}: ${parts.join(" · ")}.`
      : `Actualizó ${noun}.`;
  }

  return fallback(action, noun);
}
