import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { serializeDecimals } from "@/lib/utils/serialize-decimals";
import type { Prisma } from "@/generated/prisma/client";

export type LesseeStatusFilter = "active" | "inactive" | "all";

export interface LesseeFilters {
  status?: LesseeStatusFilter;
  search?: string;
}

/** Listado de inquilinos con conteo de contratos activos. */
export async function getLessees(filters: LesseeFilters = {}) {
  const { tenantId } = await requireAuth();

  const where: Prisma.LesseeWhereInput = { tenantId };
  const status = filters.status ?? "active";
  if (status === "active") where.isActive = true;
  if (status === "inactive") where.isActive = false;

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { legalName: { contains: search, mode: "insensitive" } },
      { contactName: { contains: search, mode: "insensitive" } },
      { rfc: { contains: search, mode: "insensitive" } },
    ];
  }

  const lessees = await prisma.lessee.findMany({
    where,
    orderBy: { legalName: "asc" },
    include: {
      contracts: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
  });

  return lessees.map((l) => {
    const { contracts, ...rest } = l;
    return {
      ...rest,
      activeContractsCount: contracts.length,
    };
  });
}

export type LesseeListItem = Awaited<ReturnType<typeof getLessees>>[number];

/** Detalle del inquilino: contratos activos e históricos con sus units. */
export async function getLesseeById(id: string) {
  const { tenantId } = await requireAuth();

  const lessee = await prisma.lessee.findFirst({
    where: { id, tenantId },
    include: {
      contracts: {
        orderBy: { startDate: "desc" },
        include: {
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

  return lessee ? serializeDecimals(lessee) : null;
}

export type LesseeDetail = NonNullable<Awaited<ReturnType<typeof getLesseeById>>>;

/** Búsqueda rápida por razón social / contacto / RFC para autocompletes. */
export async function searchLessees(query: string, limit = 10) {
  const { tenantId } = await requireAuth();

  const q = query.trim();
  if (q.length === 0) {
    return prisma.lessee.findMany({
      where: { tenantId, isActive: true },
      orderBy: { legalName: "asc" },
      take: limit,
      select: {
        id: true,
        legalName: true,
        contactName: true,
        rfc: true,
      },
    });
  }

  return prisma.lessee.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { legalName: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } },
        { rfc: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { legalName: "asc" },
    take: limit,
    select: {
      id: true,
      legalName: true,
      contactName: true,
      rfc: true,
    },
  });
}

export type LesseeSearchResult = Awaited<ReturnType<typeof searchLessees>>[number];
