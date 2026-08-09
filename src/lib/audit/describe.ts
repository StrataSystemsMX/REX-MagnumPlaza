import type {
  AuditAction,
  ContractStatus,
  ContractType,
} from "@/generated/prisma/enums";
import {
  auditActionLabel,
  contractStatusLabel,
  contractTypeLabel,
  paymentMethodLabel,
  rentStatusLabel,
} from "@/lib/i18n/enums";
import type { PaymentMethod, RentStatus } from "@/generated/prisma/enums";
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

function safePaymentMethod(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    return paymentMethodLabel(v as PaymentMethod);
  } catch {
    return v;
  }
}

function safeRentStatus(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    return rentStatusLabel(v as RentStatus);
  } catch {
    return v;
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
function describeMarker(
  marker: string,
  noun: string,
  c: Record<string, unknown>,
): string | null {
  switch (marker) {
    case "REGISTER":
    case "REGISTER_PAYMENT": {
      const monto = c.amount != null ? ` por ${fmtMoney(c.amount)}` : "";
      const metodo = safePaymentMethod(c.paymentMethod);
      return `Registró el pago de ${noun}${monto}${metodo ? ` (${metodo})` : ""}.`;
    }
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

/**
 * Detalle de un Payment a partir de las llaves de nivel superior que
 * `payments.ts` ya guarda (monto, método, fecha, estado de la renta). Cubre
 * CREATE y DELETE; la edición (UPDATE) usa el bloque `after` genérico.
 */
function describePayment(
  action: AuditAction,
  c: Record<string, unknown>,
): string | null {
  const monto = c.amount != null ? fmtMoney(c.amount) : null;
  const fecha = c.paymentDate != null ? fmtDate(c.paymentDate) : null;

  if (action === "DELETE") {
    const partes = [monto && `de ${monto}`, fecha && `del ${fecha}`].filter(Boolean);
    return partes.length ? `Eliminó un pago ${partes.join(" ")}.` : null;
  }

  if (action === "CREATE" && monto) {
    const metodo = safePaymentMethod(c.method);
    const detalles = [
      metodo && `por ${metodo.toLowerCase()}`,
      fecha && `el ${fecha}`,
    ].filter(Boolean);
    // Distingue el tipo de captura para dar contexto al monto.
    const tipo = c.cascadedFrom
      ? " aplicado como adelanto"
      : c.bulk === true
        ? " dentro de un pago agrupado"
        : "";
    const estado = safeRentStatus(c.rentStatusAfter);
    const cola = estado ? ` (renta: ${estado})` : "";
    return `Registró un pago de ${monto}${detalles.length ? ` ${detalles.join(" ")}` : ""}${tipo}${cola}.`;
  }

  return null;
}

/**
 * Detalle de un Expense (creación/edición general) a partir de monto y fecha.
 * Los marcadores (registrar pago, "sin egreso", etc.) los cubre describeMarker.
 */
function describeExpense(
  action: AuditAction,
  c: Record<string, unknown>,
): string | null {
  const monto = c.amount != null ? fmtMoney(c.amount) : null;
  const fecha = c.expenseDate != null ? fmtDate(c.expenseDate) : null;
  if (!monto && !fecha) return null;

  if (action === "CREATE") {
    const partes = [monto && `de ${monto}`, fecha && `con fecha ${fecha}`].filter(Boolean);
    return `Creó un egreso ${partes.join(" ")}.`;
  }
  if (action === "UPDATE") {
    const partes = [monto && `monto ${monto}`, fecha && `fecha ${fecha}`].filter(Boolean);
    return `Actualizó un egreso: ${partes.join(", ")}.`;
  }
  return null;
}

/**
 * Detalle de un NotificationLog. Deduce el tipo de aviso según la referencia
 * que trae el log (pago, renta morosa, contrato) y refleja el resultado del
 * envío (enviado / pendiente / fallido) y si fue manual.
 */
function describeNotification(c: Record<string, unknown>): string {
  let tipo: string;
  if (typeof c.level === "string" && c.rentId != null) {
    const ordinal =
      c.level === "1M" ? "1er" : c.level === "2M" ? "2do" : c.level === "3M" ? "3er" : null;
    tipo = ordinal ? `el ${ordinal} aviso de mora` : "un aviso de mora";
  } else if (c.paymentId != null) {
    tipo = "la confirmación de pago";
  } else if (c.contractId != null) {
    tipo = "el aviso de contrato por vencer";
  } else {
    tipo = "una notificación";
  }

  const manual = c.manual === true ? " (envío manual)" : "";
  const status = typeof c.status === "string" ? c.status : null;
  if (status === "FAILED" || status === "BOUNCED") {
    // Contrae "de el" → "del" para que la frase suene natural.
    const de = tipo.startsWith("el ") ? `del ${tipo.slice(3)}` : `de ${tipo}`;
    return `Falló el envío ${de}${manual}.`;
  }
  if (status === "PENDING") {
    return `Preparó ${tipo}, pendiente de envío${manual}.`;
  }
  return `Envió ${tipo}${manual}.`;
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
    const marker = describeMarker(c.action, noun, c);
    if (marker) return marker;
  }

  // Detalle específico por tipo de entidad usando las llaves de nivel superior
  // que cada servicio ya guarda (monto, método, fecha, estado, tipo de aviso…).
  if (entityType === "Payment") {
    const detail = describePayment(action, c);
    if (detail) return detail;
  }
  if (entityType === "Expense") {
    const detail = describeExpense(action, c);
    if (detail) return detail;
  }
  if (entityType === "NotificationLog") {
    return describeNotification(c);
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
