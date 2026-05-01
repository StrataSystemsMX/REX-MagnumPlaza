import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import type { PropertyType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type PropertyStatusFilter = "active" | "inactive" | "all";

export interface PropertyFilters {
  type?: PropertyType;
  status?: PropertyStatusFilter;
}

/** Listado de inmuebles con conteos de unidades y razones sociales asociadas. */
export async function getProperties(filters: PropertyFilters = {}) {
  const { tenantId } = await requireAuth();

  const where: Prisma.PropertyWhereInput = { tenantId };
  const status = filters.status ?? "active";
  if (status === "active") where.isActive = true;
  if (status === "inactive") where.isActive = false;
  if (filters.type) where.type = filters.type;

  const properties = await prisma.property.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      ownerEntity: { select: { id: true, code: true, legalName: true } },
      managerEntity: { select: { id: true, code: true, legalName: true } },
      units: { select: { id: true, status: true, isActive: true } },
      documents: {
        where: { type: "PROPERTY_PHOTO" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, url: true, filename: true },
      },
    },
  });

  return properties.map((p) => {
    const activeUnits = p.units.filter((u) => u.isActive);
    const { documents, ...rest } = p;
    return {
      ...rest,
      unitCounts: {
        total: activeUnits.length,
        rented: activeUnits.filter((u) => u.status === "RENTADA").length,
        available: activeUnits.filter((u) => u.status === "DISPONIBLE").length,
      },
      coverPhotoUrl: documents[0]?.url ?? null,
    };
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

  return property;
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
