import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import type { ContractStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type ContractListFilters = {
  statuses?: ContractStatus[];
  propertyId?: string;
  lesseeId?: string;
  /** Vence en los próximos N días desde hoy. */
  expiresInDays?: number;
};

/** Listado de contratos con datos de unidad, inquilino e info de vencimiento. */
export async function getContracts(filters: ContractListFilters = {}) {
  const { tenantId } = await requireAuth();

  const where: Prisma.ContractWhereInput = { tenantId };
  if (filters.statuses && filters.statuses.length > 0) {
    where.status = { in: filters.statuses };
  }
  if (filters.lesseeId) where.lesseeId = filters.lesseeId;
  if (filters.propertyId) {
    where.unit = { propertyId: filters.propertyId };
  }
  if (filters.expiresInDays !== undefined) {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setUTCDate(horizon.getUTCDate() + filters.expiresInDays);
    where.endDate = { gte: now, lte: horizon };
  }

  const contracts = await prisma.contract.findMany({
    where,
    orderBy: [{ status: "asc" }, { endDate: "asc" }],
    include: {
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
  });

  const today = Date.now();
  return contracts.map((c) => {
    const daysToExpire = Math.ceil((c.endDate.getTime() - today) / (1000 * 60 * 60 * 24));
    return {
      ...c,
      monthlyAmount: c.monthlyAmount.toNumber(),
      guaranteeAmount: c.guaranteeAmount.toNumber(),
      lateFeePercentage: c.lateFeePercentage?.toNumber() ?? null,
      daysToExpire,
    };
  });
}

export type ContractListItem = Awaited<ReturnType<typeof getContracts>>[number];

/** Detalle del contrato: unit, lessee, rents+payments, guarantees, documents. */
export async function getContractById(id: string) {
  const { tenantId } = await requireAuth();

  const contract = await prisma.contract.findFirst({
    where: { id, tenantId },
    include: {
      lessee: true,
      unit: {
        include: {
          property: {
            include: {
              ownerEntity: { select: { id: true, code: true, legalName: true } },
              managerEntity: { select: { id: true, code: true, legalName: true } },
            },
          },
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
      guarantees: {
        orderBy: { receivedDate: "desc" },
      },
      documents: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!contract) return null;

  // Serializamos Decimal → number antes de cruzar a Client Components.
  return {
    ...contract,
    monthlyAmount: contract.monthlyAmount.toNumber(),
    guaranteeAmount: contract.guaranteeAmount.toNumber(),
    lateFeePercentage: contract.lateFeePercentage?.toNumber() ?? null,
    rents: contract.rents.map((r) => ({
      ...r,
      amountDue: r.amountDue.toNumber(),
      amountPaid: r.amountPaid.toNumber(),
      payments: r.payments.map((p) => ({
        ...p,
        amount: p.amount.toNumber(),
      })),
    })),
    guarantees: contract.guarantees.map((g) => ({
      ...g,
      amount: g.amount.toNumber(),
      returnedAmount: g.returnedAmount?.toNumber() ?? null,
    })),
  };
}

export type ContractDetail = NonNullable<Awaited<ReturnType<typeof getContractById>>>;
export type ContractRent = ContractDetail["rents"][number];

/** AuditLog de un contrato: para la tab "Auditoría" del detalle. */
export async function getContractAuditLog(contractId: string) {
  const { tenantId } = await requireAuth();

  return prisma.auditLog.findMany({
    where: { tenantId, entityType: "Contract", entityId: contractId },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    take: 100,
  });
}

export type ContractAuditEntry = Awaited<ReturnType<typeof getContractAuditLog>>[number];

/** Contratos que vencen en los próximos `daysAhead` días. */
export async function getContractsExpiringSoon(daysAhead = 60) {
  return getContracts({ statuses: ["ACTIVE"], expiresInDays: daysAhead });
}

/** Unidades disponibles del tenant — para el formulario de nuevo contrato. */
export async function getAvailableUnits() {
  const { tenantId } = await requireAuth();
  const units = await prisma.unit.findMany({
    where: { tenantId, isActive: true, status: { in: ["DISPONIBLE", "APARTADA"] } },
    orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      estimatedRent: true,
      property: { select: { id: true, name: true } },
    },
  });
  return units.map((u) => ({
    ...u,
    estimatedRent: u.estimatedRent?.toNumber() ?? null,
  }));
}

export type AvailableUnit = Awaited<ReturnType<typeof getAvailableUnits>>[number];
