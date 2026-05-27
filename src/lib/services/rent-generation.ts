import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma/client";
import { computeRentStatus } from "@/lib/services/rent-status";

/**
 * Genera el primer día del mes en UTC para el periodo (year, monthIdx).
 * Usamos UTC para evitar drift por TZ — el seed y el resto del sistema
 * usan UTC consistentemente.
 */
function periodStartUTC(year: number, monthIdx: number): Date {
  return new Date(Date.UTC(year, monthIdx, 1));
}

/**
 * Construye la fecha de cobro del mes (year, monthIdx) clamada al último día
 * del mes si paymentDay excede los días disponibles.
 */
function dueDateUTC(year: number, monthIdx: number, paymentDay: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const day = Math.min(paymentDay, lastDay);
  return new Date(Date.UTC(year, monthIdx, day));
}

function decimal(n: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/**
 * Itera mes a mes desde startDate (inclusive) hasta endDate (inclusive).
 * Cada iteración devuelve el primer día del mes en UTC.
 */
function* monthsBetween(start: Date, end: Date): Generator<Date> {
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    yield periodStartUTC(y, m);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
}

export interface GenerateRentsResult {
  contractId: string;
  created: number;
  skipped: number;
  total: number;
}

/**
 * Genera un Rent por cada mes entre startDate y endDate del contrato.
 *
 * - Idempotente: usa el unique [contractId, period]; si ya existe lo salta.
 * - dueDate = paymentDay del mes correspondiente (clamado a fin de mes).
 * - status: delegado a computeRentStatus salvo el caso paidInAdvance, que
 *   marca PAID y deja amountPaid = monthlyAmount.
 * - legalEntityId = managerEntity de la property de la unit.
 *
 * Esta función NO valida permisos ni revalida paths; eso lo hace el caller
 * (Server Action). Se diseña así para que el cron mensual pueda llamarla
 * directo sin contexto de auth.
 */
export async function generateRentsForContract(
  tenantId: string,
  contractId: string,
  options: { now?: Date } = {},
): Promise<GenerateRentsResult> {
  const now = options.now ?? new Date();

  const contract = await prisma.contract.findFirstOrThrow({
    where: { id: contractId, tenantId },
    include: {
      unit: { select: { property: { select: { managerEntityId: true } } } },
    },
  });
  const legalEntityId = contract.unit.property.managerEntityId;
  const monthlyAmount = decimal(contract.monthlyAmount);

  const startDate = toDate(contract.startDate);
  const endDate = toDate(contract.endDate);
  const advanceUntil =
    contract.paidInAdvance && contract.advancePaidUntil
      ? toDate(contract.advancePaidUntil)
      : null;

  // Buscar los Rents que ya existen para este contrato — clave de idempotencia.
  const existing = await prisma.rent.findMany({
    where: { tenantId, contractId },
    select: { period: true },
  });
  const existingKeys = new Set(existing.map((r) => toDate(r.period).getTime()));

  const toCreate: Prisma.RentCreateManyInput[] = [];
  let total = 0;

  for (const period of monthsBetween(startDate, endDate)) {
    total += 1;
    if (existingKeys.has(period.getTime())) continue;

    const dueDate = dueDateUTC(
      period.getUTCFullYear(),
      period.getUTCMonth(),
      contract.paymentDay,
    );

    const advancePaid = advanceUntil !== null && period.getTime() <= advanceUntil.getTime();

    let status: Prisma.RentCreateManyInput["status"];
    let amountPaid: Prisma.Decimal;
    if (advancePaid) {
      status = "PAID";
      amountPaid = monthlyAmount;
    } else {
      amountPaid = decimal(0);
      status = computeRentStatus(amountPaid, monthlyAmount, dueDate, now);
    }

    toCreate.push({
      tenantId,
      contractId,
      legalEntityId,
      period,
      dueDate,
      amountDue: monthlyAmount,
      amountPaid,
      status,
    });
  }

  if (toCreate.length > 0) {
    await prisma.rent.createMany({ data: toCreate });
  }

  return {
    contractId,
    created: toCreate.length,
    skipped: total - toCreate.length,
    total,
  };
}

/**
 * Cron mensual (día 1): asegura que cada contrato ACTIVE tiene Rents
 * generados hasta su endDate. Útil porque algunos contratos pueden haberse
 * activado sin llamar a la generación inicial, o porque el contrato fue
 * extendido.
 */
export async function generateMonthlyRents(
  tenantId: string,
  options: { now?: Date } = {},
): Promise<GenerateRentsResult[]> {
  const contracts = await prisma.contract.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  const results: GenerateRentsResult[] = [];
  for (const c of contracts) {
    results.push(await generateRentsForContract(tenantId, c.id, options));
  }
  return results;
}

export interface ReconcileRentsResult {
  /** Meses faltantes del nuevo rango que se generaron. */
  created: number;
  /** Rentas vacías fuera del nuevo rango que se eliminaron. */
  removed: number;
  /** Rentas sin pago dentro de rango cuyo monto/fecha se re-aplicó. */
  resynced: number;
  /** Rentas fuera de rango con dinero aplicado que se conservaron (no se borran). */
  keptWithPayments: number;
}

/**
 * Re-sincroniza las rentas de un contrato ACTIVE después de editar sus
 * términos (fechas, monto, día de cobro, pago adelantado). Mantiene la
 * consistencia entre lo que dice el contrato y los Rents ya materializados:
 *
 *  1. Genera los meses faltantes del nuevo rango (idempotente).
 *  2. Elimina las rentas que quedaron FUERA del rango y NO tienen dinero
 *     aplicado. Las que sí tienen pagos o condonaciones se conservan (no se
 *     destruye historial) y se reportan en `keptWithPayments`.
 *  3. Re-aplica monto, día de cobro y pago adelantado a las rentas DENTRO del
 *     rango que siguen completamente sin pago. Las pagadas, parciales o
 *     condonadas no se tocan: ya tienen historial.
 *
 * Nota: una renta marcada PAID por pago adelantado no se revierte si se acorta
 * la ventana de adelanto (se considera historial). El cambio de adelanto aplica
 * a las rentas aún sin pago.
 */
export async function reconcileRentsForContract(
  tenantId: string,
  contractId: string,
  options: { now?: Date } = {},
): Promise<ReconcileRentsResult> {
  const now = options.now ?? new Date();

  const contract = await prisma.contract.findFirstOrThrow({
    where: { id: contractId, tenantId },
  });

  const startDate = toDate(contract.startDate);
  const endDate = toDate(contract.endDate);
  const rangeStart = periodStartUTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
  ).getTime();
  const rangeEnd = periodStartUTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
  ).getTime();
  const monthlyAmount = decimal(contract.monthlyAmount);
  const advanceUntil =
    contract.paidInAdvance && contract.advancePaidUntil
      ? toDate(contract.advancePaidUntil)
      : null;

  const rents = await prisma.rent.findMany({
    where: { tenantId, contractId },
    select: { id: true, period: true, amountPaid: true, amountWaived: true },
  });

  // 1) Fuera de rango: borrar solo las vacías; conservar las que tienen dinero.
  const toDelete: string[] = [];
  let keptWithPayments = 0;
  for (const r of rents) {
    const p = toDate(r.period).getTime();
    if (p >= rangeStart && p <= rangeEnd) continue;
    const hasMoney =
      !new Prisma.Decimal(r.amountPaid).isZero() ||
      !new Prisma.Decimal(r.amountWaived ?? 0).isZero();
    if (hasMoney) keptWithPayments += 1;
    else toDelete.push(r.id);
  }
  if (toDelete.length > 0) {
    await prisma.rent.deleteMany({ where: { id: { in: toDelete }, tenantId } });
  }

  // 2) Generar los meses faltantes del nuevo rango (idempotente).
  const gen = await generateRentsForContract(tenantId, contractId, { now });

  // 3) Re-sincronizar las rentas completamente sin pago que quedan dentro de
  //    rango (incluye las recién creadas; re-aplicar es idempotente).
  const unpaid = await prisma.rent.findMany({
    where: { tenantId, contractId, amountPaid: 0, amountWaived: 0 },
    select: { id: true, period: true },
  });
  let resynced = 0;
  for (const r of unpaid) {
    const period = toDate(r.period);
    const dueDate = dueDateUTC(
      period.getUTCFullYear(),
      period.getUTCMonth(),
      contract.paymentDay,
    );
    const advancePaid = advanceUntil !== null && period.getTime() <= advanceUntil.getTime();
    // updateMany (no update) para poder filtrar por tenantId y respetar el
    // guardrail multi-tenant (ver lib/prisma/tenant-middleware.ts).
    await prisma.rent.updateMany({
      where: { id: r.id, tenantId },
      data: {
        amountDue: monthlyAmount,
        dueDate,
        amountPaid: advancePaid ? monthlyAmount : decimal(0),
        status: advancePaid
          ? "PAID"
          : computeRentStatus(decimal(0), monthlyAmount, dueDate, now),
      },
    });
    resynced += 1;
  }

  return { created: gen.created, removed: toDelete.length, resynced, keptWithPayments };
}
