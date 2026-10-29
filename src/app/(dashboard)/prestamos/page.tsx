import { PrestamosView } from "@/components/prestamos/PrestamosView";
import { requireAuth } from "@/server/auth/get-session";
import { getUserRoleCodes } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { getLoans } from "@/server/services/prestamos-queries";
import { getLegalEntities } from "@/server/services/properties-queries";

export const metadata = { title: "Préstamos" };

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function PrestamosPage({ searchParams }: PageProps) {
  const { tenantId, dbUser } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);
  const canCreate =
    roles.includes("MASTER") || roles.includes("ADMIN") || roles.includes("ACCOUNTANT");
  const params = await searchParams;

  const requestedYear = Number(params.year);
  const year =
    Number.isFinite(requestedYear) && requestedYear > 1900
      ? requestedYear
      : new Date().getUTCFullYear();

  const oldestLoan = await prisma.loan.findFirst({
    where: { tenantId },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  const minYear = oldestLoan
    ? Math.min(oldestLoan.startDate.getUTCFullYear(), year - 1)
    : year - 1;
  const currentYear = new Date().getUTCFullYear();
  const maxYear = Math.max(currentYear, year) + 1;
  const availableYears: number[] = [];
  for (let y = maxYear; y >= minYear; y--) availableYears.push(y);

  const [loans, legalEntities] = await Promise.all([
    getLoans({ year }),
    getLegalEntities(),
  ]);

  return (
    <div className="-m-4 space-y-6 bg-gradient-to-b from-blue-400/15 to-transparent bg-[length:100%_180px] bg-no-repeat p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8 dark:from-blue-800/12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Préstamos</h1>
        <p className="text-sm text-muted-foreground">
          Financiamientos y créditos activos de la empresa.
        </p>
      </div>
      <PrestamosView
        loans={loans}
        legalEntities={legalEntities}
        canCreate={canCreate}
        year={year}
        availableYears={availableYears}
      />
    </div>
  );
}
