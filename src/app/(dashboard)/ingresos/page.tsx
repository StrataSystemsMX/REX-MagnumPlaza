import { IngresosYearlyView } from "@/components/ingresos/IngresosYearlyView";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { getYearlyCollectionsMatrix } from "@/lib/services/payments-queries";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function IngresosPage({ searchParams }: PageProps) {
  const { tenantId } = await requireAuth();
  const params = await searchParams;

  const requestedYear = Number(params.year);
  const year =
    Number.isFinite(requestedYear) && requestedYear > 1900
      ? requestedYear
      : new Date().getUTCFullYear();

  const oldestRent = await prisma.rent.findFirst({
    where: { tenantId },
    orderBy: { period: "asc" },
    select: { period: true },
  });
  const minYear = oldestRent
    ? Math.min(oldestRent.period.getUTCFullYear(), year - 1)
    : year - 1;
  const currentYear = new Date().getUTCFullYear();
  const maxYear = Math.max(currentYear, year) + 1;
  const availableYears: number[] = [];
  for (let y = maxYear; y >= minYear; y--) availableYears.push(y);

  const data = await getYearlyCollectionsMatrix(year);

  return (
    <div className="-m-8 space-y-6 bg-gradient-to-b from-green-400/22 to-transparent bg-[length:100%_180px] bg-no-repeat p-8 dark:from-green-800/18">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ingresos</h1>
        <p className="text-sm text-muted-foreground">
          Cobranza anual desglosada por razón social, plaza e inquilino.
        </p>
      </div>

      <IngresosYearlyView data={data} availableYears={availableYears} />
    </div>
  );
}
