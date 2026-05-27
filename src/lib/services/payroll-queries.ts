import { requireAuth } from "@/lib/auth/get-session";
import { getActiveLegalEntityId } from "@/lib/auth/active-legal-entity";
import { prisma } from "@/lib/prisma/client";
import type { PayrollType } from "@/generated/prisma/enums";

// PayrollTypes que se gestionan en /nominas (compensación operativa real).
export const OPERATIONAL_PAYROLL_TYPES: PayrollType[] = [
  "DIRECT_PAYROLL",
  "COMMISSION",
  "BONUS",
];
// PayrollTypes que se gestionan en /estrategia-fiscal.
export const FISCAL_STRATEGY_PAYROLL_TYPES: PayrollType[] = [
  "STRATEGY_NOMINA",
  "ADMIN_SERVICE_INVOICE",
];

export interface PayrollListFilters {
  year?: number;
  /** 1-12. Si está ausente, trae todo el año. */
  month?: number;
  legalEntityId?: string;
  type?: PayrollType;
  /** Restringe a un subconjunto de tipos. Útil para separar /nominas vs /estrategia-fiscal. */
  types?: PayrollType[];
}

/**
 * Devuelve el rango UTC [start, end) que cubre un mes concreto o el año entero.
 */
function periodRange(year: number, month?: number): { start: Date; end: Date } {
  if (month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { start, end };
  }
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  return { start, end };
}

/** Listado de nóminas con la razón social asociada. */
export async function getPayrolls(filters: PayrollListFilters = {}) {
  const { tenantId } = await requireAuth();
  const cookieEntityId = await getActiveLegalEntityId();
  const effectiveEntityId = filters.legalEntityId ?? cookieEntityId ?? undefined;

  const year = filters.year ?? new Date().getUTCFullYear();
  const { start, end } = periodRange(year, filters.month);

  const rows = await prisma.payroll.findMany({
    where: {
      tenantId,
      period: { gte: start, lt: end },
      ...(effectiveEntityId ? { legalEntityId: effectiveEntityId } : {}),
      ...(filters.type
        ? { type: filters.type }
        : filters.types && filters.types.length > 0
          ? { type: { in: filters.types } }
          : {}),
    },
    orderBy: [{ period: "desc" }, { legalEntity: { code: "asc" } }, { type: "asc" }],
    include: {
      legalEntity: { select: { id: true, code: true, legalName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    legalEntity: r.legalEntity,
    period: r.period,
    year: r.period.getUTCFullYear(),
    month: r.period.getUTCMonth() + 1,
    type: r.type,
    amount: r.amount.toNumber(),
    amountWithoutTax: r.amountWithoutTax?.toNumber() ?? null,
    taxAmount: r.taxAmount?.toNumber() ?? null,
    description: r.description,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export type PayrollListItem = Awaited<ReturnType<typeof getPayrolls>>[number];

/** Años con al menos un Payroll registrado, descendente. */
export async function getPayrollYears(): Promise<number[]> {
  const { tenantId } = await requireAuth();
  const rows = await prisma.payroll.findMany({
    where: { tenantId },
    select: { period: true },
    orderBy: { period: "desc" },
  });
  const set = new Set<number>();
  for (const r of rows) set.add(r.period.getUTCFullYear());
  return Array.from(set).sort((a, b) => b - a);
}

/** Total anual por razón social (para vista anual / stats). */
export async function getPayrollAnnualTotalsByEntity(year: number, types?: PayrollType[]) {
  const { tenantId } = await requireAuth();
  const cookieEntityId = await getActiveLegalEntityId();
  const { start, end } = periodRange(year);

  const rows = await prisma.payroll.findMany({
    where: {
      tenantId,
      period: { gte: start, lt: end },
      ...(cookieEntityId ? { legalEntityId: cookieEntityId } : {}),
      ...(types && types.length > 0 ? { type: { in: types } } : {}),
    },
    select: {
      legalEntityId: true,
      legalEntity: { select: { code: true, legalName: true } },
      amount: true,
    },
  });

  const byEntity = new Map<
    string,
    { id: string; code: string; legalName: string; total: number }
  >();
  for (const r of rows) {
    const cur = byEntity.get(r.legalEntityId);
    if (cur) {
      cur.total += r.amount.toNumber();
    } else {
      byEntity.set(r.legalEntityId, {
        id: r.legalEntityId,
        code: r.legalEntity.code,
        legalName: r.legalEntity.legalName,
        total: r.amount.toNumber(),
      });
    }
  }
  return Array.from(byEntity.values()).sort((a, b) =>
    a.code.localeCompare(b.code, "es-MX"),
  );
}

export type PayrollEntityTotal = Awaited<
  ReturnType<typeof getPayrollAnnualTotalsByEntity>
>[number];
