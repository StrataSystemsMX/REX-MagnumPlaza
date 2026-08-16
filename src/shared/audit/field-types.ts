// =============================================================================
// Tipos de campo para auditoría
// -----------------------------------------------------------------------------
// Módulo PURO (sin Prisma): se usa en el cliente (describe) y en el servidor
// (captura de `before` y reversión de ediciones). No agregar imports
// server-only aquí. Para no acoplarnos al runtime de Prisma, los Decimal se
// detectan por "pato" (tienen `.toFixed`), no por instancia.
// =============================================================================

/** Campos monetarios (Decimal en DB) — se serializan como string. */
export const MONEY_KEYS = new Set<string>([
  "amount",
  "amountDue",
  "amountPaid",
  "amountWaived",
  "monthlyAmount",
  "guaranteeAmount",
  "returnedAmount",
  "lateFeePercentage",
]);

/** Campos de fecha (DateTime en DB) — se serializan como ISO. */
export const DATE_KEYS = new Set<string>([
  "startDate",
  "endDate",
  "expenseDate",
  "paymentDate",
  "receivedDate",
  "returnedDate",
  "advancePaidUntil",
  "signedDate",
  "scheduledDate",
  "dueDate",
  "period",
  "insuranceExpiresAt",
]);

function isDecimalLike(v: unknown): boolean {
  // Decimal.js (Prisma.Decimal) tiene `.toFixed`; Date no. Así lo distinguimos
  // de una Date o de un objeto plano sin importar el runtime de Prisma.
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { toFixed?: unknown }).toFixed === "function"
  );
}

/**
 * Serializa los valores de `keys` tomados de `row` a algo JSON-safe:
 * Date → ISO string, Decimal → string, el resto tal cual. Usado para guardar
 * el snapshot `before` de una edición en el AuditLog.
 */
export function serializeFields(
  row: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined) {
      out[k] = null;
    } else if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (isDecimalLike(v)) {
      out[k] = (v as { toString(): string }).toString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Convierte un valor serializado de vuelta a algo escribible por Prisma al
 * revertir una edición. Las fechas pasan a `Date`; los Decimal se dejan como
 * string (Prisma acepta string para columnas Decimal). El resto, tal cual.
 */
export function coerceField(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (DATE_KEYS.has(key)) {
    return value instanceof Date ? value : new Date(String(value));
  }
  return value;
}

/** Aplica `coerceField` a un objeto completo de campos serializados. */
export function coerceFields(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = coerceField(k, v);
  }
  return out;
}
