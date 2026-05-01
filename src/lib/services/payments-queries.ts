import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import type { PaymentMethod, RentStatus } from "@/generated/prisma/enums";

const OUTSTANDING_STATUSES: RentStatus[] = [
  "DUE",
  "PARTIAL",
  "OVERDUE_1M",
  "OVERDUE_2M",
  "OVERDUE_3M",
];

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
            },
          },
          unit: {
            select: {
              id: true,
              code: true,
              name: true,
              property: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  const now = Date.now();
  return rents.map((r) => {
    const balance = new Prisma.Decimal(r.amountDue).minus(new Prisma.Decimal(r.amountPaid));
    const daysOverdue = Math.floor((now - r.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return { ...r, balance: balance.toString(), daysOverdue };
  });
}

export type OutstandingRent = Awaited<ReturnType<typeof getOutstandingRents>>[number];

export interface PaymentFilters {
  from?: Date;
  to?: Date;
  method?: PaymentMethod;
  lesseeId?: string;
}

/** Listado de Payments con info del Rent, contrato e inquilino. */
export async function getPayments(filters: PaymentFilters = {}) {
  const { tenantId } = await requireAuth();

  const where: Prisma.PaymentWhereInput = { tenantId };
  if (filters.from || filters.to) {
    where.paymentDate = {};
    if (filters.from) where.paymentDate.gte = filters.from;
    if (filters.to) where.paymentDate.lte = filters.to;
  }
  if (filters.method) where.method = filters.method;
  if (filters.lesseeId) {
    where.rent = { contract: { lesseeId: filters.lesseeId } };
  }

  return prisma.payment.findMany({
    where,
    orderBy: { paymentDate: "desc" },
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
                  property: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export type PaymentListItem = Awaited<ReturnType<typeof getPayments>>[number];

/** Pagos de un Rent específico (para el detalle del contrato). */
export async function getPaymentsByRent(rentId: string) {
  const { tenantId } = await requireAuth();
  return prisma.payment.findMany({
    where: { tenantId, rentId },
    orderBy: { paymentDate: "asc" },
  });
}

/** Pagos históricos de un Lessee — usado en su tab "Pagos históricos". */
export async function getPaymentsByLessee(lesseeId: string) {
  const { tenantId } = await requireAuth();
  return prisma.payment.findMany({
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
                  property: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export type LesseePayment = Awaited<ReturnType<typeof getPaymentsByLessee>>[number];

export async function getPaymentsByDateRange(from: Date, to: Date) {
  return getPayments({ from, to });
}

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
      status: true,
      dueDate: true,
    },
    orderBy: { dueDate: "asc" },
  });

  const total = rents.reduce(
    (acc, r) =>
      acc.plus(new Prisma.Decimal(r.amountDue).minus(new Prisma.Decimal(r.amountPaid))),
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
              property: { select: { name: true } },
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

  return { lessee, summary, lastPayment };
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
            select: { code: true, property: { select: { name: true } } },
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
    balance: new Prisma.Decimal(r.amountDue)
      .minus(new Prisma.Decimal(r.amountPaid))
      .toString(),
    status: r.status,
    unitCode: r.contract.unit.code,
    propertyName: r.contract.unit.property.name,
  }));
}

export type OutstandingRentLite = Awaited<
  ReturnType<typeof getOutstandingRentsForLessee>
>[number];

/**
 * Listado de TODOS los rents del tenant — alimenta la vista calendario que
 * agrupa por mes. Incluye contract.lessee y unit/property para mostrar
 * cada celda con contexto.
 */
export async function getAllRentsForCalendar() {
  const { tenantId } = await requireAuth();
  return prisma.rent.findMany({
    where: { tenantId },
    orderBy: [{ period: "asc" }],
    include: {
      contract: {
        select: {
          lessee: { select: { legalName: true } },
          unit: {
            select: {
              code: true,
              property: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}

export type CalendarRent = Awaited<ReturnType<typeof getAllRentsForCalendar>>[number];
