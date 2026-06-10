import { cache } from "react";
import type { IncludedService, PropertyType, UnitStatus } from "@/generated/prisma/enums";
import { prisma, prismaUnsafe } from "@/lib/prisma/client";

// El token se genera con randomBytes(16).toString("hex") → 32 hex chars.
const TOKEN_REGEX = /^[a-f0-9]{32}$/i;

export interface PublicVacancyData {
  unit: {
    id: string;
    code: string;
    name: string | null;
    area: number | null;
    estimatedRent: number | null;
    status: UnitStatus;
    features: Record<string, unknown> | null;
    depositMonths: number | null;
    minContractMonths: number | null;
    maintenanceFee: number | null;
    availableFrom: Date | null;
    includedServices: IncludedService[];
  };
  property: {
    name: string;
    type: PropertyType;
    address: string;
    latitude: number | null;
    longitude: number | null;
    totalArea: number | null;
  };
  unitPhotos: Array<{ id: string; url: string }>;
  propertyPhotos: Array<{ id: string; url: string }>;
  promoter: {
    fullName: string;
    agency: string | null;
  };
  tenant: {
    name: string;
    brandLogoUrl: string | null;
    brandPrimaryColor: string | null;
    contactPhone: string | null;
  };
}

export type PublicVacancyResult =
  | { kind: "ok"; data: PublicVacancyData; tracking: { linkId: string; tenantId: string } }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "deactivated" }
  | { kind: "rented" };

/**
 * Resuelve un token de PromoterLink a la información pública del local.
 *
 * Bootstrap legítimo: la primera lectura usa `prismaUnsafe` porque aún no
 * conocemos el tenant. Después de extraer tenantId del link, todas las queries
 * siguientes usan `prisma` (con guardrail multi-tenant).
 *
 * NUNCA loguear el token. El cliente Prisma puede loguear queries si
 * PERF_LOG=1; documentar y mantener apagado en prod.
 */
export const getUnitByPromoterToken = cache(
  async (token: string): Promise<PublicVacancyResult> => {
    if (!TOKEN_REGEX.test(token)) return { kind: "not_found" };

    const link = await prismaUnsafe.promoterLink.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        tenantId: true,
        isActive: true,
        expiresAt: true,
        unitId: true,
        promoterId: true,
      },
    });
    if (!link) return { kind: "not_found" };
    if (!link.isActive) return { kind: "deactivated" };
    if (link.expiresAt.getTime() <= Date.now()) return { kind: "expired" };

    const { tenantId } = link;

    const unit = await prisma.unit.findFirst({
      where: { id: link.unitId, tenantId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        area: true,
        estimatedRent: true,
        status: true,
        features: true,
        depositMonths: true,
        minContractMonths: true,
        maintenanceFee: true,
        availableFrom: true,
        includedServices: true,
        property: {
          select: {
            name: true,
            type: true,
            address: true,
            latitude: true,
            longitude: true,
            totalArea: true,
            documents: {
              where: { type: "PROPERTY_PHOTO", tenantId },
              select: { id: true, url: true },
              orderBy: [
                { sortOrder: { sort: "asc", nulls: "last" } },
                { createdAt: "desc" },
              ],
              take: 6,
            },
          },
        },
        documents: {
          where: { type: "UNIT_PHOTO", tenantId },
          select: { id: true, url: true },
          orderBy: [
            { sortOrder: { sort: "asc", nulls: "last" } },
            { createdAt: "desc" },
          ],
          take: 10,
        },
      },
    });
    if (!unit) return { kind: "not_found" };

    const statusValue = unit.status as UnitStatus;

    const [promoter, tenant] = await Promise.all([
      prisma.promoter.findFirst({
        where: { id: link.promoterId, tenantId, isActive: true },
        select: { fullName: true, agency: true },
      }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          name: true,
          brandLogoUrl: true,
          brandPrimaryColor: true,
          contactPhone: true,
        },
      }),
    ]);
    if (!promoter || !tenant) return { kind: "not_found" };

    return {
      kind: "ok",
      tracking: { linkId: link.id, tenantId },
      data: {
        unit: {
          id: unit.id,
          code: unit.code,
          name: unit.name,
          area: unit.area,
          estimatedRent: unit.estimatedRent ? unit.estimatedRent.toNumber() : null,
          status: statusValue,
          features: (unit.features as Record<string, unknown> | null) ?? null,
          depositMonths: unit.depositMonths,
          minContractMonths: unit.minContractMonths,
          maintenanceFee: unit.maintenanceFee ? unit.maintenanceFee.toNumber() : null,
          availableFrom: unit.availableFrom,
          includedServices: unit.includedServices,
        },
        property: {
          name: unit.property.name,
          type: unit.property.type,
          address: unit.property.address,
          latitude: unit.property.latitude,
          longitude: unit.property.longitude,
          totalArea: unit.property.totalArea,
        },
        unitPhotos: unit.documents,
        propertyPhotos: unit.property.documents,
        promoter,
        tenant,
      },
    };
  },
);

/**
 * Incrementa visitCount de forma atómica. Fire-and-forget — nunca debe tirar
 * la página si falla. Solo loguea linkId, jamás el token.
 */
export async function trackVacancyVisit(linkId: string, tenantId: string): Promise<void> {
  try {
    await prisma.promoterLink.updateMany({
      where: { id: linkId, tenantId },
      data: { visitCount: { increment: 1 } },
    });
  } catch (err) {
    console.error("[public-vacancy] visit increment failed", { linkId, err });
  }
}
