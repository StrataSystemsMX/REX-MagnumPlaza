import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

export async function getPromoters() {
  const { tenantId } = await requireAuth();
  const promoters = await prisma.promoter.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      links: {
        where: { isActive: true, expiresAt: { gt: new Date() } },
        select: {
          id: true,
          unitId: true,
          publicToken: true,
          expiresAt: true,
          resultedInRent: true,
          visitCount: true,
          _count: { select: { leads: true } },
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

  // Interesados por canal (físico vs digital) por liga, para las métricas.
  const linkIds = promoters.flatMap((p) => p.links.map((l) => l.id));
  const bySource = linkIds.length
    ? await prisma.lead.groupBy({
        by: ["promoterLinkId", "source"],
        where: { tenantId, promoterLinkId: { in: linkIds } },
        _count: { _all: true },
      })
    : [];
  const physicalByLink = new Map<string, number>();
  for (const g of bySource) {
    if (g.source === "PHYSICAL") {
      physicalByLink.set(g.promoterLinkId, g._count._all);
    }
  }

  return promoters.map((p) => ({
    ...p,
    links: p.links.map((l) => ({
      ...l,
      leadCount: l._count.leads,
      physicalLeadCount: physicalByLink.get(l.id) ?? 0,
    })),
  }));
}

export type PromoterRow = Awaited<ReturnType<typeof getPromoters>>[number];

export async function getAvailableUnitsForPromoterLink() {
  const { tenantId } = await requireAuth();
  const units = await prisma.unit.findMany({
    where: {
      tenantId,
      isActive: true,
      parentUnitId: null, // excluir locales agrupados bajo otro
    },
    orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      estimatedRent: true,
      property: { select: { id: true, name: true, type: true } },
    },
  });
  return units.map((u) => ({ ...u, estimatedRent: u.estimatedRent?.toNumber() ?? null }));
}

export type UnitForLink = Awaited<ReturnType<typeof getAvailableUnitsForPromoterLink>>[number];
