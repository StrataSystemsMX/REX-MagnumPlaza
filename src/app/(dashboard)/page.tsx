import Link from "next/link";
import { redirect } from "next/navigation";
import { KpiGrid } from "@/components/reports/KpiGrid";
import { MobileDashboard } from "@/components/mobile/MobileDashboard";
import { getActiveLegalEntityId } from "@/server/auth/active-legal-entity";
import { requireAuth } from "@/server/auth/get-session";
import { getUserRoleCodes, hasPermission } from "@/server/auth/permissions";
import { getIsMobileView } from "@/server/mobile/viewport";
import { prisma } from "@/server/prisma/client";
import { timed } from "@/server/perf/timed";
import { getKpiSet, type ReportScope } from "@/server/services/kpi-queries";
import { getMobileDashboardData } from "@/server/services/mobile-queries";

// ─── Constantes ──────────────────────────────────────────────────────────────

type Mode = "anual" | "mensual";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ mode?: string; mes?: string; legalEntity?: string }>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ searchParams }: PageProps) {
  const { dbUser } = await requireAuth();
  const params = await searchParams;
  const roles  = await getUserRoleCodes(dbUser.id);

  const isPromoter = roles.includes("PROMOTER");
  const isLessee   = roles.includes("LESSEE");
  if (isPromoter || isLessee) redirect(isPromoter ? "/promoter" : "/portal");

  const canSeeAll =
    roles.includes("MASTER") || roles.includes("ADMIN") ||
    roles.includes("ACCOUNTANT") || roles.includes("OWNER");
  if (!canSeeAll) redirect("/portal");

  // `legalEntity=all` (chip "Todas" del móvil) ignora la razón social activa.
  const legalEntityParam =
    params.legalEntity === "all"
      ? undefined
      : (params.legalEntity ?? (await getActiveLegalEntityId()) ?? undefined);
  const mode = (params.mode === "mensual" ? "mensual" : "anual") as Mode;

  const now          = new Date();
  const currentYear  = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  const selectedMonth = (() => {
    const n = Number(params.mes);
    return !isNaN(n) && n >= 0 && n <= 11 ? n : currentMonth;
  })();

  const periodLabel = mode === "anual"
    ? `Ene – Dic ${currentYear}`
    : `${MONTHS[selectedMonth] ?? ""} ${currentYear}`;

  // ── Rex móvil ─────────────────────────────────────────────────────────────
  if (await getIsMobileView()) {
    const [data, tenant, canRegisterPayments] = await Promise.all([
      timed("dashboard:mobileData", () =>
        getMobileDashboardData({ legalEntityId: legalEntityParam, mode, selectedMonth }),
      ),
      prisma.tenant.findUnique({ where: { id: dbUser.tenantId }, select: { name: true } }),
      hasPermission(dbUser.id, "payment.register"),
    ]);
    return (
      <MobileDashboard
        {...data}
        tenantName={tenant?.name ?? ""}
        userName={dbUser.name}
        isOwnerView={!canRegisterPayments}
        mode={mode}
        selectedMonth={selectedMonth}
        periodLabel={periodLabel}
        monthLabel={`${MONTHS[currentMonth] ?? ""} ${currentYear}`}
        activeLegalEntityId={legalEntityParam ?? null}
      />
    );
  }

  // Los 10 KPIs ejecutivos usan el mismo cálculo que /reportes (cache 5 min)
  const kpiScope: ReportScope = legalEntityParam
    ? { type: "entity", id: legalEntityParam }
    : { type: "tenant" };
  const kpiMonth = mode === "mensual" ? selectedMonth + 1 : undefined;

  const kpiSet = await timed("dashboard:kpiSet", () =>
    getKpiSet(dbUser.tenantId, kpiScope, currentYear, kpiMonth),
  );

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Indicadores clave · {periodLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted p-1 text-sm">
            <Link
              href="?mode=anual"
              className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
                mode === "anual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Anual
            </Link>
            <Link
              href={`?mode=mensual&mes=${selectedMonth}`}
              className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
                mode === "mensual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mensual
            </Link>
          </div>

          {mode === "mensual" && (
            <div className="flex w-full flex-wrap gap-1 sm:w-auto">
              {MONTHS.map((m, i) => (
                <Link
                  key={m}
                  href={`?mode=mensual&mes=${i}`}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedMonth === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.slice(0, 3)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Indicadores clave ── */}
      <KpiGrid kpiSet={kpiSet} />

    </div>
  );
}
