import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { OUTSTANDING_STATUSES } from "@/lib/constants/rent-statuses";
import { prisma } from "@/lib/prisma/client";
import { serializeDecimals } from "@/lib/utils/serialize-decimals";
import { unitCode, unitWithProperty } from "@/lib/i18n/unit-label";
import type { PaymentMethod, PropertyType, RentStatus } from "@/generated/prisma/enums";

export { OUTSTANDING_STATUSES };

export interface OutstandingFilters {
  statuses?: RentStatus[];
  propertyId?: string;
  /** Periodo en formato 'YYYY-MM' (filtra por mes del periodo). */
  period?: string;
  lesseeId?: string;
}

/**
 * Listado de Rents pendientes de cobro: DUE, PARTIAL, OVERDUE_*.
 * Incluye contract.lessee y unit.property para mostrar contexto en la tabla.
 */
export async function getOutstandingRents(filters: OutstandingFilters = {}) {
  const { tenantId } = await requireAuth();

  const where: Prisma.RentWhereInput = {
    tenantId,
    status: { in: filters.statuses ?? OUTSTANDING_STATUSES },
  };
  if (filters.lesseeId) {
    where.contract = { lesseeId: filters.lesseeId };
  }
  if (filters.propertyId) {
    where.contract = {
      ...(where.contract as Prisma.ContractWhereInput | undefined),
      unit: { propertyId: filters.propertyId },
    };
  }
  if (filters.period) {
    const [yearStr, monthStr] = filters.period.split("-");
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    if (Number.isFinite(year) && Number.isFinite(monthIdx)) {
      const start = new Date(Date.UTC(year, monthIdx, 1));
      const end = new Date(Date.UTC(year, monthIdx + 1, 1));
      where.period = { gte: start, lt: end };
    }
  }

  const rents = await prisma.rent.findMany({
    where,
    orderBy: [{ dueDate: "asc" }],
    include: {
      contract: {
        include: {
          lessee: {
            select: {
              id: true,
              legalName: true,
              contactName: true,
              whatsapp: true,
              email: true,
              preferredChannel: true,
            },
          },
          unit: {
            select: {
              id: true,
              code: true,
              name: true,
              property: { select: { id: true, name: true, type: true } },
            },
          },
        },
      },
    },
  });

  const now = Date.now();
  return rents.map((r) => {
    const balance = new Prisma.Decimal(r.amountDue)
      .minus(new Prisma.Decimal(r.amountPaid))
      .minus(new Prisma.Decimal(r.amountWaived ?? 0));
    const daysOverdue = Math.floor((now - r.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return serializeDecimals({ ...r, balance: balance.toString(), daysOverdue });
  });
}

export type OutstandingRent = Awaited<ReturnType<typeof getOutstandingRents>>[number];

export interface PaymentFilters {
  from?: Date;
  to?: Date;
  method?: PaymentMethod;
  lesseeId?: string;
}

/**
 * Listado de Payments con info del Rent, contrato e inquilino.
 *
 * Defaults conservadores para no traer histórico completo:
 *   - Ventana de 90 días si no se pasa `from`/`to`.
 *   - Tope duro de 200 registros para acotar payload.
 * El caller puede sobreescribir con `filters.from` o `filters.take`.
 */
export async function getPayments(filters: PaymentFilters & { take?: number } = {}) {
  const { tenantId } = await requireAuth();

  const where: Prisma.PaymentWhereInput = { tenantId };
  const hasExplicitRange = Boolean(filters.from || filters.to);
  if (hasExplicitRange) {
    where.paymentDate = {};
    if (filters.from) where.paymentDate.gte = filters.from;
    if (filters.to) where.paymentDate.lte = filters.to;
  } else {
    // Default: últimos 90 días.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    where.paymentDate = { gte: ninetyDaysAgo };
  }
  if (filters.method) where.method = filters.method;
  if (filters.lesseeId) {
    where.rent = { contract: { lesseeId: filters.lesseeId } };
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { paymentDate: "desc" },
    take: filters.take ?? 200,
    include: {
      rent: {
        select: {
          id: true,
          period: true,
          amountDue: true,
          amountPaid: true,
          status: true,
          contract: {
            select: {
              id: true,
              lessee: { select: { id: true, legalName: true, contactName: true } },
              unit: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  property: { select: { id: true, name: true, type: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  return serializeDecimals(payments);
}

export type PaymentListItem = Awaited<ReturnType<typeof getPayments>>[number];

/** Pagos históricos de un Lessee — usado en su tab "Pagos históricos". */
export async function getPaymentsByLessee(lesseeId: string) {
  const { tenantId } = await requireAuth();
  const payments = await prisma.payment.findMany({
    where: { tenantId, rent: { contract: { lesseeId } } },
    orderBy: { paymentDate: "desc" },
    include: {
      rent: {
        select: {
          id: true,
          period: true,
          contract: {
            select: {
              id: true,
              unit: {
                select: {
                  code: true,
                  name: true,
                  property: { select: { name: true, type: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  return serializeDecimals(payments);
}

export type LesseePayment = Awaited<ReturnType<typeof getPaymentsByLessee>>[number];

/**
 * Saldo pendiente total de un inquilino: suma de (amountDue - amountPaid)
 * de todos sus Rents en estados DUE/PARTIAL/OVERDUE_*. Usado en el header
 * del estado de cuenta y en la tarjeta de resumen.
 */
export async function getOutstandingByLessee(lesseeId: string): Promise<{
  total: string;
  overdueCount: number;
  partialCount: number;
  oldestDueDate: Date | null;
}> {
  const { tenantId } = await requireAuth();

  const rents = await prisma.rent.findMany({
    where: {
      tenantId,
      contract: { lesseeId },
      status: { in: OUTSTANDING_STATUSES },
    },
    select: {
      amountDue: true,
      amountPaid: true,
      amountWaived: true,
      status: true,
      dueDate: true,
    },
    orderBy: { dueDate: "asc" },
  });

  const total = rents.reduce(
    (acc, r) =>
      acc.plus(
        new Prisma.Decimal(r.amountDue)
          .minus(new Prisma.Decimal(r.amountPaid))
          .minus(new Prisma.Decimal(r.amountWaived ?? 0)),
      ),
    new Prisma.Decimal(0),
  );
  const overdueCount = rents.filter((r) =>
    ["OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"].includes(r.status),
  ).length;
  const partialCount = rents.filter((r) => r.status === "PARTIAL").length;
  const oldestDueDate = rents[0]?.dueDate ?? null;

  return {
    total: total.toString(),
    overdueCount,
    partialCount,
    oldestDueDate,
  };
}

/**
 * Estado de cuenta del inquilino: contratos con sus rents, pagos, y resumen.
 * Devuelve datos suficientes para renderizar la tab "Estado de cuenta" y
 * después generar el PDF (Prompt 8).
 */
export async function getLesseeStatement(lesseeId: string) {
  const { tenantId } = await requireAuth();

  const lessee = await prisma.lessee.findFirst({
    where: { id: lesseeId, tenantId },
    include: {
      contracts: {
        orderBy: { startDate: "desc" },
        include: {
          unit: {
            select: {
              code: true,
              name: true,
              property: { select: { name: true, type: true } },
            },
          },
          rents: {
            orderBy: { period: "asc" },
            include: {
              payments: {
                orderBy: { paymentDate: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!lessee) return null;

  const summary = await getOutstandingByLessee(lesseeId);

  // Último pago global del inquilino.
  const lastPayment = await prisma.payment.findFirst({
    where: { tenantId, rent: { contract: { lesseeId } } },
    orderBy: { paymentDate: "desc" },
  });

  return serializeDecimals({ lessee, summary, lastPayment });
}

export type LesseeStatement = NonNullable<Awaited<ReturnType<typeof getLesseeStatement>>>;

/**
 * Helper para los dialogs de pago: lista de Rents pendientes de un inquilino,
 * útil para mostrar las opciones en el bulk payment dialog.
 */
export async function getOutstandingRentsForLessee(lesseeId: string) {
  const { tenantId } = await requireAuth();
  const rents = await prisma.rent.findMany({
    where: {
      tenantId,
      contract: { lesseeId },
      status: { in: OUTSTANDING_STATUSES },
    },
    orderBy: { dueDate: "asc" },
    include: {
      contract: {
        select: {
          unit: {
            select: {
              code: true,
              name: true,
              property: { select: { name: true, type: true } },
            },
          },
        },
      },
    },
  });
  return rents.map((r) => ({
    id: r.id,
    period: r.period,
    dueDate: r.dueDate,
    amountDue: r.amountDue.toString(),
    amountPaid: r.amountPaid.toString(),
    amountWaived: r.amountWaived.toString(),
    balance: new Prisma.Decimal(r.amountDue)
      .minus(new Prisma.Decimal(r.amountPaid))
      .minus(new Prisma.Decimal(r.amountWaived ?? 0))
      .toString(),
    status: r.status,
    unitCode: r.contract.unit.code,
    propertyName: r.contract.unit.property.name,
    // Etiqueta lista para UI: "Inmueble · Local" en plazas, solo el nombre del
    // inmueble en inmuebles individuales (no muestra el código "LP").
    unitLabel: unitWithProperty(r.contract.unit, " "),
  }));
}

export type OutstandingRentLite = Awaited<
  ReturnType<typeof getOutstandingRentsForLessee>
>[number];

/**
 * Vista mensual agrupada por Property — pivote para la pantalla "Cobros del Mes".
 * Para cada Property activa devuelve TODAS sus Units (incluso vacías), con su
 * contrato activo del periodo (si existe), el Rent del periodo (si existe), y
 * un estado derivado: PAID / PARTIAL / SIN_PAGO / PRE_PAGADO / ABONO / VACANT.
 *
 * El periodo se interpreta en UTC (matches Rent.period que es el primer día
 * del mes UTC). El estado depende del periodo vs. la fecha actual:
 *   - Periodo pasado o actual: PAID (cubierto) / PARTIAL (pago insuficiente) / SIN_PAGO.
 *   - Periodo futuro:          PRE_PAGADO (cubierto) / ABONO (pago insuficiente) / SIN_PAGO.
 */
export type MonthlyUnitStatus =
  | "PAID"
  | "PARTIAL"
  | "SIN_PAGO"
  | "PRE_PAGADO"
  | "ABONO"
  | "WAIVED"
  | "VACANT";

/**
 * Deriva el estado de una renta a partir de los montos y la posición del
 * periodo respecto al mes actual. Centralizado para que monthly y yearly
 * coincidan.
 *
 * Saldo efectivo = amountDue - amountWaived. Una renta condonada parcialmente
 * con $X y luego pagada el resto debe mostrarse como PAID, no como PARTIAL.
 */
function deriveMonthlyStatus(
  period: Date,
  amountPaid: Prisma.Decimal,
  amountDue: Prisma.Decimal,
  now: Date,
  rentStatus?: RentStatus | null,
  amountWaived: Prisma.Decimal = new Prisma.Decimal(0),
): MonthlyUnitStatus {
  if (rentStatus === "WAIVED") return "WAIVED";

  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const isFuture = period.getTime() > currentMonthStart.getTime();
  const effectiveDue = amountDue.minus(amountWaived);
  const fullyPaid =
    effectiveDue.lessThanOrEqualTo(0) ||
    (amountPaid.greaterThanOrEqualTo(effectiveDue) && effectiveDue.greaterThan(0));
  const hasPayment = amountPaid.greaterThan(0);

  if (fullyPaid) return isFuture ? "PRE_PAGADO" : "PAID";
  if (hasPayment) return isFuture ? "ABONO" : "PARTIAL";
  return "SIN_PAGO";
}

export interface MonthlyUnitRow {
  unitId: string;
  unitCode: string;
  unitName: string | null;
  contractId: string | null;
  lesseeId: string | null;
  lesseeLegalName: string | null;
  /** Canal preferido (CommunicationChannel) para enviar avisos. */
  lesseePreferredChannel: string | null;
  lesseeWhatsapp: string | null;
  lesseeEmail: string | null;
  rentId: string | null;
  amountDue: string;
  amountPaid: string;
  rentStatus: RentStatus | null;
  status: MonthlyUnitStatus;
  /** Meses pre-pagados desde el periodo consultado (sólo si PRE_PAGADO). */
  prePaidMonths: number | null;
  /** Nivel de escalón 1/2/3 si está OVERDUE_xM, null en otro caso. */
  overdueLevel: 1 | 2 | 3 | null;
  /** Última persona asociada a la unidad si está vacía (último contrato). */
  lastLesseeName: string | null;
}

export interface MonthlyPropertyGroup {
  propertyId: string;
  propertyName: string;
  propertyType: PropertyType;
  managerEntityCode: string;
  ownerEntityCode: string;
  unitCount: number;
  expectedTotal: string;
  units: MonthlyUnitRow[];
}

export interface MonthlyCollections {
  period: Date;
  properties: MonthlyPropertyGroup[];
  totals: {
    paid: number;
    partial: number;
    sinPago: number;
    prePagado: number;
    abono: number;
    vacant: number;
  };
}

export async function getMonthlyCollectionsByProperty(period: Date): Promise<MonthlyCollections> {
  const { tenantId } = await requireAuth();

  const now = new Date();
  const periodStart = new Date(
    Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1),
  );

  // 3 queries planas en paralelo en vez de 1 nested deep. Prisma serializaba
  // los 5 niveles de include en ~6 round-trips a Supabase (≈1s); aquí son
  // 3 round-trips simultáneos (≈150ms total).
  const [propertiesRaw, activeContracts, rentsInPeriod] = await Promise.all([
    prisma.property.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        ownerEntity: { select: { code: true } },
        managerEntity: { select: { code: true } },
        units: {
          // parentUnitId: null → excluimos sub-locales agrupados bajo otro
          // (p. ej. L4 dentro de L3-L4). Se cobran vía su local padre, no como
          // unidad independiente; si no, aparecerían como una fila "Vacío".
          where: { isActive: true, parentUnitId: null },
          orderBy: { code: "asc" },
          select: {
            id: true,
            code: true,
            name: true,
            // Para mostrar el código agrupado "L3-L4" cuando el local tiene
            // sub-locales rentados en conjunto.
            childUnits: { select: { code: true }, orderBy: { code: "asc" } },
          },
        },
      },
    }),
    prisma.contract.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        startDate: { lt: periodEnd },
        endDate: { gte: periodStart },
      },
      orderBy: { startDate: "desc" }, // más reciente primero → "primero gana"
      select: {
        id: true,
        unitId: true,
        monthlyAmount: true,
        paidInAdvance: true,
        advancePaidUntil: true,
        lessee: {
          select: {
            id: true,
            legalName: true,
            preferredChannel: true,
            whatsapp: true,
            email: true,
          },
        },
      },
    }),
    prisma.rent.findMany({
      where: { tenantId, period: periodStart },
      select: {
        id: true,
        contractId: true,
        amountDue: true,
        amountPaid: true,
        amountWaived: true,
        status: true,
      },
    }),
  ]);

  // Index para joins en memoria. "Primero gana" preserva el comportamiento
  // del original `take: 1, orderBy: startDate desc`.
  const contractByUnit = new Map<string, (typeof activeContracts)[number]>();
  for (const c of activeContracts) {
    if (!contractByUnit.has(c.unitId)) contractByUnit.set(c.unitId, c);
  }
  const rentByContract = new Map<string, (typeof rentsInPeriod)[number]>();
  for (const r of rentsInPeriod) rentByContract.set(r.contractId, r);

  // Para units vacías traemos el último contrato (cualquiera) para mostrar
  // el último inquilino que ocupó el local — útil como contexto en la fila.
  // Se hace en una 4ª query secuencial porque depende de saber qué units
  // quedan vacías. Es chica (sólo IN-list de ~5-10 units).
  const emptyUnitIds = propertiesRaw.flatMap((p) =>
    p.units.filter((u) => !contractByUnit.has(u.id)).map((u) => u.id),
  );
  const lastContractsByUnit = emptyUnitIds.length
    ? await prisma.contract
        .findMany({
          where: { tenantId, unitId: { in: emptyUnitIds } },
          orderBy: { endDate: "desc" },
          select: {
            unitId: true,
            lessee: { select: { legalName: true } },
          },
        })
        .then((rows) => {
          const map = new Map<string, string>();
          for (const r of rows) {
            if (!map.has(r.unitId)) map.set(r.unitId, r.lessee.legalName);
          }
          return map;
        })
    : new Map<string, string>();

  // Reshape al formato original: properties con units anidadas y contrato+rent
  // pegados a cada unit (como si fuera el include nested original).
  const properties = propertiesRaw.map((p) => ({
    ...p,
    units: p.units.map((u) => {
      const contract = contractByUnit.get(u.id);
      return {
        ...u,
        contracts: contract
          ? [
              {
                ...contract,
                rents: rentByContract.has(contract.id)
                  ? [rentByContract.get(contract.id)!]
                  : [],
              },
            ]
          : [],
      };
    }),
  }));

  const totals = {
    paid: 0,
    partial: 0,
    sinPago: 0,
    prePagado: 0,
    abono: 0,
    vacant: 0,
  };

  const groups: MonthlyPropertyGroup[] = properties.map((p) => {
    let expected = new Prisma.Decimal(0);
    const rows: MonthlyUnitRow[] = p.units.map((u) => {
      const contract = u.contracts[0];
      // Código agrupado: "L3-L4" si el local cubre sub-locales; "L3" si no.
      const displayCode = unitCode(u);

      if (!contract) {
        totals.vacant += 1;
        return {
          unitId: u.id,
          unitCode: displayCode,
          unitName: u.name,
          contractId: null,
          lesseeId: null,
          lesseeLegalName: null,
          lesseePreferredChannel: null,
          lesseeWhatsapp: null,
          lesseeEmail: null,
          rentId: null,
          amountDue: "0",
          amountPaid: "0",
          rentStatus: null,
          status: "VACANT",
          prePaidMonths: null,
          overdueLevel: null,
          lastLesseeName: lastContractsByUnit.get(u.id) ?? null,
        };
      }

      const rent = contract.rents[0] ?? null;
      const amountDue = rent ? new Prisma.Decimal(rent.amountDue) : new Prisma.Decimal(contract.monthlyAmount);
      const amountPaid = rent ? new Prisma.Decimal(rent.amountPaid) : new Prisma.Decimal(0);
      const amountWaived = rent ? new Prisma.Decimal(rent.amountWaived ?? 0) : new Prisma.Decimal(0);
      expected = expected.plus(amountDue);

      const status = deriveMonthlyStatus(
        period,
        amountPaid,
        amountDue,
        now,
        rent?.status,
        amountWaived,
      );

      // Meses pre-pagados (para tooltip): solo aplica si el contrato fue
      // marcado con paidInAdvance/advancePaidUntil. Es metadata informativa.
      const prePaidMonths =
        status === "PRE_PAGADO" && contract.paidInAdvance && contract.advancePaidUntil
          ? Math.max(
              0,
              (contract.advancePaidUntil.getUTCFullYear() - period.getUTCFullYear()) * 12 +
                (contract.advancePaidUntil.getUTCMonth() - period.getUTCMonth()),
            )
          : null;

      switch (status) {
        case "PAID":
          totals.paid += 1;
          break;
        case "PARTIAL":
          totals.partial += 1;
          break;
        case "SIN_PAGO":
          totals.sinPago += 1;
          break;
        case "PRE_PAGADO":
          totals.prePagado += 1;
          break;
        case "ABONO":
          totals.abono += 1;
          break;
      }

      const overdueLevel: 1 | 2 | 3 | null =
        rent?.status === "OVERDUE_1M"
          ? 1
          : rent?.status === "OVERDUE_2M"
            ? 2
            : rent?.status === "OVERDUE_3M"
              ? 3
              : null;

      return {
        unitId: u.id,
        unitCode: displayCode,
        unitName: u.name,
        contractId: contract.id,
        lesseeId: contract.lessee.id,
        lesseeLegalName: contract.lessee.legalName,
        lesseePreferredChannel: contract.lessee.preferredChannel,
        lesseeWhatsapp: contract.lessee.whatsapp,
        lesseeEmail: contract.lessee.email,
        rentId: rent?.id ?? null,
        amountDue: amountDue.toString(),
        amountPaid: amountPaid.toString(),
        rentStatus: rent?.status ?? null,
        status,
        prePaidMonths,
        overdueLevel,
        lastLesseeName: null,
      };
    });

    return {
      propertyId: p.id,
      propertyName: p.name,
      propertyType: p.type,
      managerEntityCode: p.managerEntity.code,
      ownerEntityCode: p.ownerEntity.code,
      unitCount: p.units.length,
      expectedTotal: expected.toString(),
      units: rows,
    };
  });

  return { period: periodStart, properties: groups, totals };
}

/**
 * Matriz anual de cobranza: 12 meses × locales, agrupado por Property.
 * Cada celda lleva el estado derivado del mes (mismo enum que la vista
 * mensual). Pensado para una vista tipo Excel donde de un vistazo se ven
 * patrones de morosidad histórica.
 */
export interface YearlyCell {
  period: Date;
  rentId: string | null;
  contractId: string | null;
  amountDue: string;
  amountPaid: string;
  amountWaived: string;
  status: MonthlyUnitStatus;
  prePaidMonths: number | null;
  overdueLevel: 1 | 2 | 3 | null;
}

export interface YearlyUnitRow {
  unitId: string;
  unitCode: string;
  unitName: string | null;
  currentLesseeName: string | null;
  currentLesseeId: string | null;
  cells: YearlyCell[];
  expectedTotal: string;
  paidTotal: string;
}

export interface YearlyPropertyGroup {
  propertyId: string;
  propertyName: string;
  managerEntityCode: string;
  ownerEntityCode: string;
  unitCount: number;
  expectedTotal: string;
  paidTotal: string;
  units: YearlyUnitRow[];
}

export interface YearlyCollections {
  year: number;
  properties: YearlyPropertyGroup[];
  monthlyTotals: Array<{
    period: Date;
    expected: string;
    paid: string;
    paidCount: number;
    sinPagoCount: number;
  }>;
}

export async function getYearlyCollectionsMatrix(year: number): Promise<YearlyCollections> {
  const { tenantId } = await requireAuth();

  const now = new Date();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const periods: Date[] = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(year, i, 1)),
  );

  const properties = await prisma.property.findMany({
    where: { tenantId, isActive: true, status: "ACTIVO" },
    orderBy: { name: "asc" },
    include: {
      ownerEntity: { select: { code: true } },
      managerEntity: { select: { code: true } },
      units: {
        // Excluimos sub-locales agrupados (parentUnitId != null): se cobran vía
        // su local padre, no como unidad independiente.
        where: { isActive: true, parentUnitId: null },
        orderBy: { code: "asc" },
        include: {
          // Para mostrar el código agrupado "L3-L4" en la matriz anual.
          childUnits: { select: { code: true }, orderBy: { code: "asc" } },
          contracts: {
            where: {
              startDate: { lt: yearEnd },
              endDate: { gte: yearStart },
            },
            orderBy: { startDate: "desc" },
            include: {
              lessee: { select: { id: true, legalName: true } },
              rents: {
                where: { period: { gte: yearStart, lt: yearEnd } },
              },
            },
          },
        },
      },
    },
  });

  const monthlyAgg = periods.map((p) => ({
    period: p,
    expected: new Prisma.Decimal(0),
    paid: new Prisma.Decimal(0),
    paidCount: 0,
    sinPagoCount: 0,
  }));

  const groups: YearlyPropertyGroup[] = properties.map((p) => {
    let groupExpected = new Prisma.Decimal(0);
    let groupPaid = new Prisma.Decimal(0);

    const rows: YearlyUnitRow[] = p.units.map((u) => {
      const rentByMonth = new Map<string, (typeof u.contracts)[number]["rents"][number]>();
      const contractByMonth = new Map<string, (typeof u.contracts)[number]>();
      for (const c of u.contracts) {
        for (const r of c.rents) {
          const key = monthKey(r.period);
          rentByMonth.set(key, r);
          contractByMonth.set(key, c);
        }
        for (const period of periods) {
          const key = monthKey(period);
          if (contractByMonth.has(key)) continue;
          const periodEnd = new Date(
            Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1),
          );
          if (
            c.startDate < periodEnd &&
            c.endDate >= period &&
            c.status === "ACTIVE"
          ) {
            contractByMonth.set(key, c);
          }
        }
      }

      let unitExpected = new Prisma.Decimal(0);
      let unitPaid = new Prisma.Decimal(0);

      const cells: YearlyCell[] = periods.map((period, i) => {
        const key = monthKey(period);
        const contract = contractByMonth.get(key);
        const rent = rentByMonth.get(key);

        if (!contract) {
          return {
            period,
            rentId: null,
            contractId: null,
            amountDue: "0",
            amountPaid: "0",
            amountWaived: "0",
            status: "VACANT",
            prePaidMonths: null,
            overdueLevel: null,
          };
        }

        const amountDue = rent
          ? new Prisma.Decimal(rent.amountDue)
          : new Prisma.Decimal(contract.monthlyAmount);
        const amountPaid = rent
          ? new Prisma.Decimal(rent.amountPaid)
          : new Prisma.Decimal(0);
        const amountWaived = rent
          ? new Prisma.Decimal(rent.amountWaived ?? 0)
          : new Prisma.Decimal(0);
        unitExpected = unitExpected.plus(amountDue);
        unitPaid = unitPaid.plus(amountPaid);
        monthlyAgg[i]!.expected = monthlyAgg[i]!.expected.plus(amountDue);
        monthlyAgg[i]!.paid = monthlyAgg[i]!.paid.plus(amountPaid);

        const status = deriveMonthlyStatus(
          period,
          amountPaid,
          amountDue,
          now,
          rent?.status,
          amountWaived,
        );

        const prePaidMonths =
          status === "PRE_PAGADO" && contract.paidInAdvance && contract.advancePaidUntil
            ? Math.max(
                0,
                (contract.advancePaidUntil.getUTCFullYear() - period.getUTCFullYear()) * 12 +
                  (contract.advancePaidUntil.getUTCMonth() - period.getUTCMonth()),
              )
            : null;

        if (status === "PAID" || status === "PRE_PAGADO") monthlyAgg[i]!.paidCount += 1;
        if (status === "SIN_PAGO") monthlyAgg[i]!.sinPagoCount += 1;

        const overdueLevel: 1 | 2 | 3 | null =
          rent?.status === "OVERDUE_1M"
            ? 1
            : rent?.status === "OVERDUE_2M"
              ? 2
              : rent?.status === "OVERDUE_3M"
                ? 3
                : null;

        return {
          period,
          rentId: rent?.id ?? null,
          contractId: contract.id,
          amountDue: amountDue.toString(),
          amountPaid: amountPaid.toString(),
          amountWaived: amountWaived.toString(),
          status,
          prePaidMonths,
          overdueLevel,
        };
      });

      groupExpected = groupExpected.plus(unitExpected);
      groupPaid = groupPaid.plus(unitPaid);

      const current = u.contracts[0];

      return {
        unitId: u.id,
        unitCode: unitCode(u),
        unitName: u.name,
        currentLesseeName: current?.lessee.legalName ?? null,
        currentLesseeId: current?.lessee.id ?? null,
        cells,
        expectedTotal: unitExpected.toString(),
        paidTotal: unitPaid.toString(),
      };
    });

    return {
      propertyId: p.id,
      propertyName: p.name,
      managerEntityCode: p.managerEntity.code,
      ownerEntityCode: p.ownerEntity.code,
      unitCount: p.units.length,
      expectedTotal: groupExpected.toString(),
      paidTotal: groupPaid.toString(),
      units: rows,
    };
  });

  return {
    year,
    properties: groups,
    monthlyTotals: monthlyAgg.map((m) => ({
      period: m.period,
      expected: m.expected.toString(),
      paid: m.paid.toString(),
      paidCount: m.paidCount,
      sinPagoCount: m.sinPagoCount,
    })),
  };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

