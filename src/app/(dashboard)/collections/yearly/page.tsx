import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { YearlyCollectionsMatrix } from "@/components/collections/YearlyCollectionsMatrix";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { getYearlyCollectionsMatrix } from "@/lib/services/payments-queries";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function YearlyCollectionsPage({ searchParams }: PageProps) {
  const { tenantId } = await requireAuth();
  const params = await searchParams;

  const requestedYear = Number(params.year);
  const year = Number.isFinite(requestedYear) && requestedYear > 1900
    ? requestedYear
    : new Date().getUTCFullYear();

  // Para el selector: rango ±2 años alrededor del primer rent histórico y el actual.
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/collections"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Volver a Cobranza
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Cobranza anual {year}
          </h1>
          <p className="text-sm text-muted-foreground">
            Vista matriz: 12 meses × locales. Click en una celda para registrar pago.
          </p>
        </div>
      </div>

      <YearlyCollectionsMatrix data={data} availableYears={availableYears} />
    </div>
  );
}
