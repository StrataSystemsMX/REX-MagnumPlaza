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
          property: { select: { id: true, name: true, type: true } },
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
      // property: sólo scalars (incluye ownerEntityId/managerEntityId como FKs).
      // Las entidades se cargan abajo en una sola query para evitar dos
      // SELECT legal_entities IN ($1) duplicados que Prisma dispara cuando
      // hacemos include de ownerEntity + managerEntity por separado.
      unit: {
        include: {
          property: true,
          childUnits: { select: { id: true, code: true }, orderBy: { code: "asc" } },
        },
      },
      rents: {
        // Traemos sólo los últimos 24 meses para evitar cargar 5+ años en contratos viejos.
        orderBy: { period: "desc" },
        take: 24,
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

  const entityIds = Array.from(
    new Set([
      contract.unit.property.ownerEntityId,
      contract.unit.property.managerEntityId,
    ]),
  );
  const entities = await prisma.legalEntity.findMany({
    where: { tenantId, id: { in: entityIds } },
    select: { id: true, code: true, legalName: true },
  });
  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const ownerEntity = entityMap.get(contract.unit.property.ownerEntityId)!;
  const managerEntity = entityMap.get(contract.unit.property.managerEntityId)!;

  // Serializamos Decimal → number antes de cruzar a Client Components.
  return {
    ...contract,
    monthlyAmount: contract.monthlyAmount.toNumber(),
    guaranteeAmount: contract.guaranteeAmount.toNumber(),
    lateFeePercentage: contract.lateFeePercentage?.toNumber() ?? null,
    unit: {
      ...contract.unit,
      estimatedRent: contract.unit.estimatedRent?.toNumber() ?? null,
      property: {
        ...contract.unit.property,
        ownerEntity,
        managerEntity,
      },
    },
    rents: contract.rents
      .map((r) => ({
        ...r,
        amountDue: r.amountDue.toNumber(),
        amountPaid: r.amountPaid.toNumber(),
        amountWaived: r.amountWaived.toNumber(),
        payments: r.payments.map((p) => ({
          ...p,
          amount: p.amount.toNumber(),
        })),
      }))
      // La query trae desc para `take: 24`; reordenamos a asc para la UI.
      .reverse(),
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

  const logs = await prisma.auditLog.findMany({
    where: { tenantId, entityType: "Contract", entityId: contractId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Evitamos `include: { user }` porque cuando userId es null Prisma aún
  // dispara `SELECT users WHERE id IN (NULL)` — round-trip a la nada.
  // Hacemos un único findMany filtrando nulls.
  const userIds = Array.from(
    new Set(logs.map((l) => l.userId).filter((id): id is string => !!id)),
  );
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { tenantId, id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return logs.map((l) => ({
    ...l,
    user: l.userId ? (userMap.get(l.userId) ?? null) : null,
  }));
}

export type ContractAuditEntry = Awaited<ReturnType<typeof getContractAuditLog>>[number];

/** Unidades disponibles del tenant — para el formulario de nuevo contrato.
 *  Excluye:
 *   - unidades cuyo inmueble está BLOQUEADO (no rentable);
 *   - sub-locales agrupados bajo otro (`parentUnitId != null`): se rentan junto
 *     con su local padre (ej. L1-L2 = Goyoma), nunca por separado;
 *   - unidades que ya tengan un contrato vigente. No basta con el campo
 *     `status`: si por seed, migración o edición manual quedó desincronizado,
 *     una unidad ya ocupada podría seguir marcada como DISPONIBLE. La fuente de
 *     verdad es la existencia de un contrato en estado no-terminal. */
export async function getAvailableUnits() {
  const { tenantId } = await requireAuth();
  const units = await prisma.unit.findMany({
    where: {
      tenantId,
      isActive: true,
      status: { in: ["DISPONIBLE", "APARTADA"] },
      property: { status: "ACTIVO" },
      parentUnitId: null,
      contracts: {
        none: { status: { in: ["DRAFT", "ACTIVE", "PENDING_RENEWAL"] } },
      },
    },
    orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      estimatedRent: true,
      property: { select: { id: true, name: true, type: true } },
    },
  });
  return units.map((u) => ({
    ...u,
    estimatedRent: u.estimatedRent?.toNumber() ?? null,
  }));
}

export type AvailableUnit = Awaited<ReturnType<typeof getAvailableUnits>>[number];
