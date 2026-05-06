import {
  getActiveLegalEntityId,
  legalEntityPropertyFilter,
} from "@/lib/auth/active-legal-entity";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { serializeDecimals } from "@/lib/utils/serialize-decimals";
import type { PropertyType, UnitStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type PropertyStatusFilter = "active" | "inactive" | "all";

export interface PropertyFilters {
  type?: PropertyType;
  typeIn?: PropertyType[];
  typeNotIn?: PropertyType[];
  status?: PropertyStatusFilter;
}

/** Listado de inmuebles con conteos de unidades y razones sociales asociadas. */
export async function getProperties(filters: PropertyFilters = {}) {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();

  const where: Prisma.PropertyWhereInput = {
    tenantId,
    ...legalEntityPropertyFilter(activeLegalEntityId),
  };
  const status = filters.status ?? "active";
  if (status === "active") where.isActive = true;
  if (status === "inactive") where.isActive = false;
  if (filters.type) where.type = filters.type;
  if (filters.typeIn && filters.typeIn.length > 0) {
    where.type = { in: filters.typeIn };
  }
  if (filters.typeNotIn && filters.typeNotIn.length > 0) {
    where.type = { notIn: filters.typeNotIn };
  }

  const properties = await prisma.property.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      ownerEntity: { select: { id: true, code: true, legalName: true } },
      managerEntity: { select: { id: true, code: true, legalName: true } },
      units: {
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          isActive: true,
          estimatedRent: true,
          contracts: {
            where: { status: "ACTIVE" },
            orderBy: { startDate: "desc" },
            take: 1,
            select: {
              id: true,
              monthlyAmount: true,
              lessee: { select: { id: true, legalName: true, contactName: true } },
            },
          },
        },
      },
      documents: {
        where: { type: "PROPERTY_PHOTO" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, url: true, filename: true },
      },
    },
  });

  return properties
    .map((p) => {
      const activeUnits = p.units.filter((u) => u.isActive);
      const { documents, ...rest } = p;
      return serializeDecimals({
        ...rest,
        unitCounts: {
          total: activeUnits.length,
          rented: activeUnits.filter((u) => u.status === "RENTADA").length,
          available: activeUnits.filter((u) => u.status === "DISPONIBLE").length,
        },
        coverPhotoUrl: documents[0]?.url ?? null,
      });
    })
    .sort((a, b) => {
      // Más unidades primero; alfabético como desempate.
      if (b.unitCounts.total !== a.unitCounts.total) {
        return b.unitCounts.total - a.unitCounts.total;
      }
      return a.name.localeCompare(b.name, "es-MX");
    });
}

export type PropertyListItem = Awaited<ReturnType<typeof getProperties>>[number];

/** Detalle del inmueble con units, contratos activos y documentos. */
export async function getPropertyById(id: string) {
  const { tenantId } = await requireAuth();

  const property = await prisma.property.findFirst({
    where: { id, tenantId },
    include: {
      ownerEntity: { select: { id: true, code: true, legalName: true } },
      managerEntity: { select: { id: true, code: true, legalName: true } },
      units: {
        where: { isActive: true },
        orderBy: { code: "asc" },
        include: {
          contracts: {
            where: { status: "ACTIVE" },
            orderBy: { startDate: "desc" },
            take: 1,
            include: {
              lessee: { select: { id: true, legalName: true, contactName: true } },
            },
          },
          documents: {
            where: { type: "UNIT_PHOTO" },
            orderBy: { createdAt: "desc" },
            select: { id: true, url: true, filename: true, createdAt: true },
          },
        },
      },
      documents: {
        where: { type: "PROPERTY_PHOTO" },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, url: true, filename: true, createdAt: true },
      },
    },
  });

  return property ? serializeDecimals(property) : null;
}

export type PropertyDetail = NonNullable<Awaited<ReturnType<typeof getPropertyById>>>;
export type UnitWithContract = PropertyDetail["units"][number];

/** Razones sociales del tenant — para selects en formularios. */
export async function getLegalEntities() {
  const { tenantId } = await requireAuth();
  return prisma.legalEntity.findMany({
    where: { tenantId, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, legalName: true, isOperator: true },
  });
}

export type LegalEntityOption = Awaited<ReturnType<typeof getLegalEntities>>[number];

export interface UnitsGroupedFilters {
  status?: UnitStatus;
  propertyId?: string;
  propertyTypeIn?: PropertyType[];
  lesseeId?: string;
  search?: string;
}

/** Locales agrupados por su plaza/inmueble padre, con contrato activo, inquilino y foto. */
export async function getUnitsGrouped(filters: UnitsGroupedFilters = {}) {
  const { tenantId } = await requireAuth();
  const activeLegalEntityId = await getActiveLegalEntityId();

  const propertyWhere: Prisma.PropertyWhereInput = {
    tenantId,
    isActive: true,
    ...legalEntityPropertyFilter(activeLegalEntityId),
  };
  if (filters.propertyId) propertyWhere.id = filters.propertyId;
  if (filters.propertyTypeIn && filters.propertyTypeIn.length > 0) {
    propertyWhere.type = { in: filters.propertyTypeIn };
  }

  const unitWhere: Prisma.UnitWhereInput = { isActive: true };
  if (filters.status) unitWhere.status = filters.status;
  if (filters.lesseeId) {
    unitWhere.contracts = {
      some: { status: "ACTIVE", lesseeId: filters.lesseeId },
    };
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim();
    unitWhere.OR = [
      { code: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
    ];
  }

  const properties = await prisma.property.findMany({
    where: {
      ...propertyWhere,
      units: { some: unitWhere },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      ownerEntity: { select: { id: true, code: true, legalName: true } },
      managerEntity: { select: { id: true, code: true, legalName: true } },
      units: {
        where: unitWhere,
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          area: true,
          estimatedRent: true,
          status: true,
          notes: true,
          propertyId: true,
          contracts: {
            where: { status: "ACTIVE" },
            orderBy: { startDate: "desc" },
            take: 1,
            select: {
              id: true,
              monthlyAmount: true,
              startDate: true,
              endDate: true,
              lessee: { select: { id: true, legalName: true, contactName: true } },
            },
          },
          documents: {
            where: { type: "UNIT_PHOTO" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, url: true, filename: true },
          },
        },
      },
    },
  });

  return properties
    .map((p) => {
      const units = p.units.map((u) => {
        const { documents, ...rest } = u;
        return serializeDecimals({
          ...rest,
          coverPhotoUrl: documents[0]?.url ?? null,
        });
      });
      const rented = units.filter((u) => u.status === "RENTADA").length;
      return {
        property: {
          id: p.id,
          name: p.name,
          type: p.type,
          ownerEntity: p.ownerEntity,
          managerEntity: p.managerEntity,
        },
        units,
        counts: {
          total: units.length,
          rented,
          available: units.filter((u) => u.status === "DISPONIBLE").length,
        },
      };
    })
    .sort((a, b) => {
      if (b.counts.total !== a.counts.total) return b.counts.total - a.counts.total;
      return a.property.name.localeCompare(b.property.name, "es-MX");
    });
}

export type UnitsGroupedItem = Awaited<ReturnType<typeof getUnitsGrouped>>[number];
export type UnitsGroupedUnit = UnitsGroupedItem["units"][number];
