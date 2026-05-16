import { PrestamosView } from "@/components/prestamos/PrestamosView";
import {
  getLoanYears,
  getLoansYearlyMatrix,
  getPrestamosKpis,
} from "@/lib/services/prestamos-queries";

export const metadata = { title: "Préstamos" };

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function PrestamosPage({ searchParams }: Props) {
  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getUTCFullYear();

  const availableYears = await getLoanYears();
  const year = yearParam
    ? Math.max(2020, Math.min(2100, Number(yearParam)))
    : (availableYears[0] ?? currentYear);

  const [kpis, matrix] = await Promise.all([
    getPrestamosKpis(year),
    getLoansYearlyMatrix(year),
  ]);

  return (
    <div className="-m-4 space-y-6 bg-gradient-to-b from-blue-400/15 to-transparent bg-[length:100%_180px] bg-no-repeat p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8 dark:from-blue-800/12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Préstamos</h1>
        <p className="text-sm text-muted-foreground">
          Financiamientos de vehículos, hipotecas y créditos corporativos.
        </p>
      </div>
      <PrestamosView
        kpis={kpis}
        matrix={matrix}
        availableYears={availableYears}
      />
    </div>
  );
}
