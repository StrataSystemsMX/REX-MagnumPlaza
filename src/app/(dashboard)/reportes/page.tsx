import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { KpiGrid } from "@/components/reports/KpiGrid";
import { ReportsTabs } from "@/components/reports/ReportsTabs";
import { ScopeSelector } from "@/components/reports/ScopeSelector";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import { getReportsBundle } from "@/lib/services/reports-queries";
import { getKpiSet, type ReportScope } from "@/lib/services/kpi-queries";

interface PageProps {
  searchParams: Promise<{
    scope?: string;
    id?: string;
    year?: string;
    month?: string;
  }>;
}

type ScopeType = "tenant" | "entity" | "property" | "unit" | "detail";

type ParsedScope =
  | { ready: true; scope: ReportScope }
  | { ready: false; type: Exclude<ScopeType, "tenant" | "detail"> };

function parseScopeFromParams(scopeStr?: string, id?: string): ParsedScope {
  if (!scopeStr || scopeStr === "tenant" || scopeStr === "detail") {
    return { ready: true, scope: { type: "tenant" } };
  }
  if (scopeStr === "entity" || scopeStr === "property" || scopeStr === "unit") {
    if (!id) return { ready: false, type: scopeStr };
    return { ready: true, scope: { type: scopeStr, id } };
  }
  return { ready: true, scope: { type: "tenant" } };
}

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default async function ReportesPage({ searchParams }: PageProps) {
  const { dbUser, tenantId } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);

  const isPromoter = roles.includes("PROMOTER");
  const isLessee = roles.includes("LESSEE");
  if (isPromoter || isLessee) redirect(isPromoter ? "/promoter" : "/portal");

  const canSee =
    roles.includes("MASTER") || roles.includes("ADMIN") || roles.includes("ACCOUNTANT");
  if (!canSee) redirect("/");

  const params = await searchParams;

  const requestedYear = Number(params.year);
  const year =
    Number.isFinite(requestedYear) && requestedYear > 1900
      ? requestedYear
      : new Date().getUTCFullYear();

  const requestedMonth = Number(params.month);
  const month =
    Number.isFinite(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
      ? requestedMonth
      : undefined;

  const isDetailMode = params.scope === "detail";
  const parsedScope = parseScopeFromParams(params.scope, params.id);

  // Available year range
  const oldestRent = await prisma.rent.findFirst({
    where: { tenantId },
    orderBy: { period: "asc" },
    select: { period: true },
  });
  const minYear = oldestRent
    ? Math.min(oldestRent.period.getUTCFullYear(), year - 1)
    : year - 1;
  const maxYear = Math.max(new Date().getUTCFullYear(), year) + 1;
  const availableYears: number[] = [];
  for (let y = maxYear; y >= minYear; y--) availableYears.push(y);

  // Load selector options + KPIs in parallel
  const [legalEntities, properties, allUnits, kpiSet] = await Promise.all([
    prisma.legalEntity.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, legalName: true },
      orderBy: { code: "asc" },
    }),
    prisma.property.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.unit.findMany({
      where: { tenantId, isActive: true, parentUnitId: null },
      select: {
        id: true,
        code: true,
        name: true,
        property: { select: { name: true } },
      },
      orderBy: [{ property: { name: "asc" } }, { code: "asc" }],
    }),
    !isDetailMode && parsedScope.ready
      ? getKpiSet(tenantId, parsedScope.scope, year, month)
      : Promise.resolve(null),
  ]);

  const units = allUnits.map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
    propertyName: u.property.name,
  }));

  const bundle = isDetailMode ? await getReportsBundle(tenantId, year) : null;

  // Subtitle label
  const periodLabel = month ? `${MONTH_LABELS[month - 1]} ${year}` : String(year);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Indicadores clave por portafolio, razón social, inmueble o local · {periodLabel}
        </p>
      </header>

      <Suspense>
        <ScopeSelector
          legalEntities={legalEntities}
          properties={properties}
          units={units}
          year={year}
          availableYears={availableYears}
        />
      </Suspense>

      {isDetailMode ? (
        bundle && <ReportsTabs bundle={bundle} />
      ) : !parsedScope.ready ? (
        <p className="text-sm text-muted-foreground">
          Selecciona{" "}
          {parsedScope.type === "entity"
            ? "una razón social"
            : parsedScope.type === "property"
              ? "un inmueble"
              : "un local"}{" "}
          de arriba para ver sus indicadores.
        </p>
      ) : kpiSet ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <BarChart3 className="size-3.5" />
            Indicadores clave · {periodLabel}
          </h2>
          <KpiGrid kpiSet={kpiSet} />
        </section>
      ) : null}
    </div>
  );
}
