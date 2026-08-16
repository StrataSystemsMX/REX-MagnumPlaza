import {
  getActiveLegalEntityId,
  legalEntityPropertyFilter,
} from "@/server/auth/active-legal-entity";
import { requireAuth } from "@/server/auth/get-session";
import { prisma } from "@/server/prisma/client";
import { serializeDecimals } from "@/shared/utils/serialize-decimals";
import type { PropertyType } from "@/generated/prisma/enums";
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
          area: true,
          notes: true,
          propertyId: true,
          parentUnitId: true,
          childUnits: {
            select: { id: true, code: true, area: true },
            orderBy: { code: "asc" },
          },
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
            orderBy: [
              { sortOrder: { sort: "asc", nulls: "last" } },
              { createdAt: "desc" },
            ],
            take: 50,
            select: { id: true, url: true, filename: true },
          },
        },
      },
      documents: {
        where: { type: "PROPERTY_PHOTO" },
        orderBy: [
          { sortOrder: { sort: "asc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        take: 50,
        select: { id: true, url: true, filename: true },
      },
    },
  });

  return properties
    .map((p) => {
      const activeUnits = p.units.filter((u) => u.isActive);
      // Las unidades agrupadas (parentUnitId != null) se colapsan visualmente bajo
      // su padre en la UI, así que tampoco deben contar para ocupación.
      const countableUnits = activeUnits.filter((u) => !u.parentUnitId);
      const { documents, units, ...rest } = p;
      const unitsWithPhoto = units.map((u) => {
        const { documents: unitDocs, ...unitRest } = u;
        return {
          ...unitRest,
          coverPhotoUrl: unitDocs[0]?.url ?? null,
          photos: unitDocs,
        };
      });
      return serializeDecimals({
        ...rest,
        units: unitsWithPhoto,
        unitCounts: {
          total: countableUnits.length,
          rented: countableUnits.filter((u) => u.status === "RENTADA").length,
          available: countableUnits.filter((u) => u.status === "DISPONIBLE").length,
        },
        coverPhotoUrl: documents[0]?.url ?? null,
        photos: documents,
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
