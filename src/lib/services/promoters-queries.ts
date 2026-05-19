import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

export async function getPromoters() {
  const { tenantId } = await requireAuth();
  return prisma.promoter.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      links: {
        where: { isActive: true, expiresAt: { gt: new Date() } },
        select: { id: true, unitId: true, expiresAt: true, resultedInRent: true, visitCount: true },
      },
    },
  });
}

export type PromoterRow = Awaited<ReturnType<typeof getPromoters>>[number];

export async function getAvailableUnitsForPromoterLink() {
  const { tenantId } = await requireAuth();
  const units = await prisma.unit.findMany({
    where: {
      tenantId,
      isActive: true,
      status: { in: ["DISPONIBLE", "APARTADA"] },
    },
    orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      estimatedRent: true,
      property: { select: { id: true, name: true } },
    },
  });
  return units.map((u) => ({ ...u, estimatedRent: u.estimatedRent?.toNumber() ?? null }));
}

export type UnitForLink = Awaited<ReturnType<typeof getAvailableUnitsForPromoterLink>>[number];
