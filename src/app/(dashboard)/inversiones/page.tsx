import { InversionesView } from "@/components/inversiones/InversionesView";
import {
  getInversionesKpis,
  getInvestmentProjects,
  getLoanYears,
  getLoansYearlyMatrix,
} from "@/lib/services/inversiones-queries";

export const metadata = { title: "Inversiones y Préstamos" };

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function InversionesPage({ searchParams }: Props) {
  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getUTCFullYear();

  const availableYears = await getLoanYears();
  const year = yearParam
    ? Math.max(2020, Math.min(2100, Number(yearParam)))
    : (availableYears[0] ?? currentYear);

  const [kpis, matrix, projects] = await Promise.all([
    getInversionesKpis(year),
    getLoansYearlyMatrix(year),
    getInvestmentProjects(),
  ]);

  return (
    <div className="-m-8 space-y-6 bg-gradient-to-b from-blue-400/15 to-transparent bg-[length:100%_180px] bg-no-repeat p-8 dark:from-blue-800/12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Inversiones y Préstamos
        </h1>
        <p className="text-sm text-muted-foreground">
          Financiamientos de vehículos, hipotecas, créditos y proyectos de
          inversión.
        </p>
      </div>
      <InversionesView
        kpis={kpis}
        matrix={matrix}
        availableYears={availableYears}
        projects={projects}
      />
    </div>
  );
}
