import { InversionesView } from "@/components/inversiones/InversionesView";
import { requireAuth } from "@/server/auth/get-session";
import { getUserRoleCodes } from "@/server/auth/permissions";
import {
  getInversionesKpis,
  getInvestmentProjects,
} from "@/server/services/inversiones-queries";
import { getLegalEntities } from "@/server/services/properties-queries";
import { prisma } from "@/server/prisma/client";

export const metadata = { title: "Inversiones" };

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function InversionesPage({ searchParams }: PageProps) {
  const { dbUser, tenantId } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);
  const canCreate =
    roles.includes("MASTER") || roles.includes("ADMIN") || roles.includes("ACCOUNTANT");
  const params = await searchParams;

  const requestedYear = Number(params.year);
  const year =
    Number.isFinite(requestedYear) && requestedYear > 1900
      ? requestedYear
      : new Date().getUTCFullYear();

  const oldestProject = await prisma.investmentProject.findFirst({
    where: { tenantId },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  const minYear = oldestProject
    ? Math.min(oldestProject.startDate.getUTCFullYear(), year - 1)
    : year - 1;
  const currentYear = new Date().getUTCFullYear();
  const maxYear = Math.max(currentYear, year) + 1;
  const availableYears: number[] = [];
  for (let y = maxYear; y >= minYear; y--) availableYears.push(y);

  const [kpis, projects, legalEntities, properties] = await Promise.all([
    getInversionesKpis(),
    getInvestmentProjects({ year }),
    getLegalEntities(),
    prisma.property.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="-m-4 space-y-6 bg-gradient-to-b from-blue-400/15 to-transparent bg-[length:100%_180px] bg-no-repeat p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8 dark:from-blue-800/12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inversiones</h1>
        <p className="text-sm text-muted-foreground">
          Proyectos de inversión y avance presupuestal.
        </p>
      </div>
      <InversionesView
        kpis={kpis}
        projects={projects}
        legalEntities={legalEntities}
        properties={properties}
        canCreate={canCreate}
        year={year}
        availableYears={availableYears}
      />
    </div>
  );
}
