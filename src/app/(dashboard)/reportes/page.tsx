import { redirect } from "next/navigation";
import { ReportsTabs } from "@/components/reports/ReportsTabs";
import { YearSelector } from "@/components/reports/YearSelector";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { getReportsBundle } from "@/lib/services/reports-queries";

interface ReportsPageProps {
  searchParams: Promise<{ year?: string }>;
}

function parseYear(raw: string | undefined): number {
  if (raw && /^\d{4}$/.test(raw)) return Number(raw);
  return new Date().getUTCFullYear();
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { dbUser, tenantId } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);

  const isMaster = roles.includes("MASTER");
  const isAdmin = roles.includes("ADMIN");
  const isAccountant = roles.includes("ACCOUNTANT");
  const isPromoter = roles.includes("PROMOTER");
  const isLessee = roles.includes("LESSEE");

  if (isPromoter || isLessee) {
    redirect(isPromoter ? "/promoter" : "/portal");
  }
  const canSeeAll = isMaster || isAdmin || isAccountant || roles.length === 0;
  if (!canSeeAll) redirect("/");

  const params = await searchParams;
  const year = parseYear(params.year);
  const bundle = await getReportsBundle(tenantId, year);

  const thisYear = new Date().getUTCFullYear();
  const yearOptions: number[] = [];
  for (let y = thisYear - 2; y <= thisYear + 1; y++) yearOptions.push(y);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Vistas analíticas de la cartera, ocupación, ingresos, egresos y contratos.
          </p>
        </div>
        <YearSelector currentYear={year} options={yearOptions} />
      </header>

      <ReportsTabs bundle={bundle} />
    </div>
  );
}
