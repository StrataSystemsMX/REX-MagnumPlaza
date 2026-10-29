import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, AlertTriangle, BarChart2, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinancialHistoryChart } from "@/components/dashboard/charts";
import { LegalEntitySummaryTable } from "@/components/dashboard/LegalEntitySummaryTable";
import { MetricCard } from "@/components/shared/metric-card";
import { getActiveLegalEntityId } from "@/server/auth/active-legal-entity";
import { requireAuth } from "@/server/auth/get-session";
import { getUserRoleCodes, hasPermission } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { timed } from "@/server/perf/timed";
import { formatMXN } from "@/shared/format-currency";
import { MobileDashboard } from "@/components/mobile/MobileDashboard";
import { shortPropertyName } from "@/shared/mobile/format";
import { getIsMobileView } from "@/server/mobile/viewport";
import {
  getMobileMorosity,
  getMobileOverdueMaintenanceCount,
} from "@/server/services/mobile-queries";
import type { RentStatus } from "@/generated/prisma/enums";

// ─── Formatters ──────────────────────────────────────────────────────────────

const PCT = new Intl.NumberFormat("es-MX", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// ─── Constantes ──────────────────────────────────────────────────────────────

type Mode = "anual" | "mensual";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const EXPENSE_TYPE_LABEL: Record<string, string> = {
  PAYROLL:         "Nómina",
  TAX:             "Impuestos",
  UTILITY:         "Servicios",
  MAINTENANCE:     "Mantenimiento",
  INSURANCE:       "Seguros",
  FINANCING:       "Financiamientos",
  PROFESSIONAL_FEE:"Honorarios",
  BANK_FEE:        "Comisiones bancarias",
  OFFICE:          "Oficina",
  VEHICLE:         "Vehículos",
  OTHER:           "Otros",
};

// ─── Helpers de badge ────────────────────────────────────────────────────────


function overdueBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "OVERDUE_3M": return { label: "3 meses", cls: "bg-red-600 text-white" };
    case "OVERDUE_2M": return { label: "2 meses", cls: "bg-red-100 text-red-700" };
    case "OVERDUE_1M": return { label: "1 mes",   cls: "bg-orange-100 text-orange-700" };
    default:           return { label: "Vencido", cls: "bg-amber-100 text-amber-700" };
  }
}

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

  const periodStart = mode === "anual"
    ? new Date(Date.UTC(currentYear, 0, 1))
    : new Date(Date.UTC(currentYear, selectedMonth, 1));
  const periodEnd = mode === "anual"
    ? new Date(Date.UTC(currentYear + 1, 0, 1))
    : new Date(Date.UTC(currentYear, selectedMonth + 1, 1));

  // El semáforo siempre refleja el mes en curso
  const currentMonthStart = new Date(Date.UTC(currentYear, currentMonth, 1));

  const leFilter        = legalEntityParam ? { legalEntityId: legalEntityParam } : {};
  const paymentLeFilter = legalEntityParam ? { rent: { legalEntityId: legalEntityParam } } : {};
  const propLeFilter    = legalEntityParam ? { managerEntityId: legalEntityParam } : {};

  const pageStart = performance.now();
  const [
    ventas,
    egresos,
    propertiesWithUnits,
    overdueRentsRaw,
    paymentsDetail,
    expensesDetail,
    legalEntities,
    cobranzaMonthRents,
  ] = await Promise.all([
    // KPI cards — respetan el filtro de LE
    timed("dashboard:ventas.aggregate", () => prisma.payment.aggregate({
      where: { tenantId: dbUser.tenantId, paymentDate: { gte: periodStart, lt: periodEnd }, ...paymentLeFilter },
      _sum: { amount: true },
    })),
    // Sólo egresos ya pagados: "Ventas" cuenta dinero efectivamente cobrado
    // (Payment), así que "Costo de Operación" debe contar dinero efectivamente
    // pagado para que Utilidad/Rentabilidad comparen periodos equivalentes.
    // De lo contrario, en modo anual se compara el cobrado a la fecha contra
    // el presupuesto completo de los 12 meses (incluyendo meses futuros aún
    // no pagados), lo que arroja una rentabilidad artificialmente negativa.
    timed("dashboard:egresos.aggregate", () => prisma.expense.aggregate({
      where: { tenantId: dbUser.tenantId, expenseDate: { gte: periodStart, lt: periodEnd }, isPaid: true, ...leFilter },
      _sum: { amount: true },
    })),
    // Semáforo de locales — filtrado por managerEntityId
    timed("dashboard:propertiesWithUnits", () => prisma.property.findMany({
      where: { tenantId: dbUser.tenantId, isActive: true, ...propLeFilter },
      select: {
        id: true,
        name: true,
        units: {
          where: { isActive: true },
          select: {
            id: true,
            code: true,
            status: true,
            contracts: {
              where: { status: "ACTIVE" },
              take: 1,
              select: {
                monthlyAmount: true,
                lessee: { select: { legalName: true } },
                rents: {
                  where: { period: currentMonthStart },
                  take: 1,
                  select: { status: true },
                },
              },
            },
          },
          orderBy: { code: "asc" },
        },
      },
      orderBy: { name: "asc" },
    })),

    // Adeudos — para el top overdue
    timed("dashboard:overdueRents", () => prisma.rent.findMany({
      where: {
        tenantId: dbUser.tenantId,
        status: { in: ["DUE", "PARTIAL", "OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"] },
        ...leFilter,
      },
      select: {
        amountDue: true,
        amountPaid: true,
        status: true,
        contract: {
          select: {
            lessee: { select: { id: true, legalName: true } },
            unit: { select: { code: true, property: { select: { name: true } } } },
          },
        },
      },
    })),

    // Detalle de pagos para resumen por LE y ranking de plazas (sin filtro de LE)
    timed("dashboard:paymentsDetail", () => prisma.payment.findMany({
      where: { tenantId: dbUser.tenantId, paymentDate: { gte: periodStart, lt: periodEnd } },
      select: {
        amount: true,
        rent: {
          select: {
            legalEntityId: true,
            contract: { select: { unit: { select: { propertyId: true } } } },
          },
        },
      },
    })),

    // Detalle de egresos para resumen por LE y egresos por tipo (sin filtro de LE).
    // Filtramos por isPaid para que coincida con la base "cobrado/pagado real"
    // del KPI de rentabilidad (ver egresos.aggregate) y no mezcle el gasto ya
    // erogado con el presupuesto de meses futuros aún no pagados.
    timed("dashboard:expensesDetail", () => prisma.expense.findMany({
      where: { tenantId: dbUser.tenantId, expenseDate: { gte: periodStart, lt: periodEnd }, isPaid: true },
      select: {
        amount: true,
        legalEntityId: true,
        category: { select: { type: true } },
      },
    })),

    // Razones sociales activas
    timed("dashboard:legalEntities", () => prisma.legalEntity.findMany({
      where: { tenantId: dbUser.tenantId, isActive: true },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    })),

    // Cobranza del mes en curso (independiente del periodo del dashboard)
    timed("dashboard:cobranzaMonthRents", () => prisma.rent.findMany({
      where: {
        tenantId: dbUser.tenantId,
        period: currentMonthStart,
        ...leFilter,
      },
      select: { status: true, amountDue: true, amountPaid: true },
    })),
  ]);
  if (process.env["NODE_ENV"] !== "production" || process.env["PERF_LOG"] === "1") {
    console.log(
      `[PERF] / (dashboard) TOTAL: ${Math.round(performance.now() - pageStart)}ms`,
    );
  }

  // ── Cobranza mes en curso ──────────────────────────────────────────────────
  const cobranzaExpected  = cobranzaMonthRents.reduce((s, r) => s + Number(r.amountDue), 0);
  const cobranzaCollected = cobranzaMonthRents.reduce((s, r) => s + Number(r.amountPaid), 0);
  const cobranzaPct = cobranzaExpected > 0
    ? Math.round((cobranzaCollected / cobranzaExpected) * 100)
    : 0;
  let cobranzaPaid = 0, cobranzaPartial = 0, cobranzaPending = 0, cobranzaOverdue = 0;
  for (const r of cobranzaMonthRents) {
    if (r.status === "PAID") cobranzaPaid++;
    else if (r.status === "PARTIAL") cobranzaPartial++;
    else if (r.status === "PENDING" || r.status === "DUE") cobranzaPending++;
    else if (r.status === "OVERDUE_1M" || r.status === "OVERDUE_2M" || r.status === "OVERDUE_3M") cobranzaOverdue++;
  }
  const cobranzaTone =
    cobranzaPct >= 90 ? "emerald" :
    cobranzaPct >= 70 ? "blue" :
    cobranzaPct >= 50 ? "amber" : "rose";
  const cobranzaToneText: Record<string, string> = {
    emerald: "text-emerald-600",
    blue:    "text-blue-600",
    amber:   "text-amber-600",
    rose:    "text-rose-600",
  };
  const cobranzaToneBar: Record<string, string> = {
    emerald: "bg-emerald-500",
    blue:    "bg-blue-500",
    amber:   "bg-amber-500",
    rose:    "bg-rose-500",
  };

  // ── KPI cards ──────────────────────────────────────────────────────────────
  const ventasTotal  = Number(ventas._sum.amount  ?? 0);
  const egresosTotal = Number(egresos._sum.amount  ?? 0);
  const utilidad     = ventasTotal - egresosTotal;
  const rentabilidad = ventasTotal > 0 ? utilidad / ventasTotal : 0;
  const periodLabel = mode === "anual"
    ? `Ene – Dic ${currentYear}`
    : `${MONTHS[selectedMonth] ?? ""} ${currentYear}`;


  // ── Resumen por Razón Social ───────────────────────────────────────────────
  const incomeByLE   = new Map<string, number>();
  const expensesByLE = new Map<string, number>();
  for (const p of paymentsDetail)
    incomeByLE.set(p.rent.legalEntityId, (incomeByLE.get(p.rent.legalEntityId) ?? 0) + Number(p.amount));
  for (const e of expensesDetail)
    expensesByLE.set(e.legalEntityId, (expensesByLE.get(e.legalEntityId) ?? 0) + Number(e.amount));

  const byLegalEntity = legalEntities.map((le) => {
    const income   = incomeByLE.get(le.id)   ?? 0;
    const expenses = expensesByLE.get(le.id) ?? 0;
    const profit   = income - expenses;
    return { id: le.id, code: le.code, income, expenses, profit, rent: income > 0 ? profit / income : 0 };
  });

  // ── Egresos por tipo ──────────────────────────────────────────────────────
  const expByType = new Map<string, number>();
  for (const e of expensesDetail)
    expByType.set(e.category.type, (expByType.get(e.category.type) ?? 0) + Number(e.amount));
  const expensesByTypeArr = Array.from(expByType.entries())
    .map(([type, total]) => ({ type, label: EXPENSE_TYPE_LABEL[type] ?? type, total }))
    .sort((a, b) => b.total - a.total);
  const maxExpType = expensesByTypeArr[0]?.total ?? 1;

  // ── Ranking de Plazas ─────────────────────────────────────────────────────
  const collectedByProp = new Map<string, number>();
  for (const p of paymentsDetail) {
    const propId = p.rent.contract.unit.propertyId;
    collectedByProp.set(propId, (collectedByProp.get(propId) ?? 0) + Number(p.amount));
  }
  const rankingPlazas = propertiesWithUnits
    .map((p) => {
      const expectedMonthly = p.units.reduce(
        (s, u) => s + (u.contracts[0] ? Number(u.contracts[0].monthlyAmount) : 0),
        0,
      );
      return {
        id: p.id,
        name: p.name,
        expectedMonthly,
        collected: collectedByProp.get(p.id) ?? 0,
        totalUnits: p.units.length,
        rentedUnits: p.units.filter((u) => u.status === "RENTADA").length,
      };
    })
    .filter((p) => p.expectedMonthly > 0)
    .sort((a, b) => b.expectedMonthly - a.expectedMonthly);
  const maxExpected = rankingPlazas[0]?.expectedMonthly ?? 1;

  // ── Alertas ───────────────────────────────────────────────────────────────
  type AlertLevel = "warning" | "critical";
  const alerts: { level: AlertLevel; message: string }[] = [];

  const totalSinRenta = propertiesWithUnits.reduce(
    (s, p) => s + p.units.filter((u) => u.status !== "RENTADA").length, 0,
  );
  if (totalSinRenta > 0)
    alerts.push({ level: "warning", message: `${totalSinRenta} local${totalSinRenta > 1 ? "es" : ""} sin renta activa.` });

  const totalNoPago = propertiesWithUnits.reduce((s, p) =>
    s + p.units.filter((u) => {
      if (u.status !== "RENTADA" || !u.contracts[0]) return false;
      const st = u.contracts[0].rents[0]?.status;
      return st && st !== "PAID" && st !== "PENDING";
    }).length, 0,
  );
  if (totalNoPago > 0)
    alerts.push({
      level: totalNoPago > 3 ? "critical" : "warning",
      message: `${totalNoPago} local${totalNoPago > 1 ? "es" : ""} con renta pendiente de cobro.`,
    });

  const overdue3M = overdueRentsRaw.filter((r) => r.status === "OVERDUE_3M").length;
  if (overdue3M > 0)
    alerts.push({ level: "critical", message: `${overdue3M} renta${overdue3M > 1 ? "s" : ""} con 3+ meses vencidos. Requieren acción.` });

  // ── Top Adeudos ───────────────────────────────────────────────────────────
  const levelOrder: Record<string, number> = { DUE: 0, PARTIAL: 0, OVERDUE_1M: 1, OVERDUE_2M: 2, OVERDUE_3M: 3 };
  const overdueMap = new Map<string, {
    lesseeId: string; legalName: string; unitLabel: string; total: number; count: number; worstStatus: RentStatus;
  }>();
  for (const r of overdueRentsRaw) {
    const l  = r.contract.lessee;
    const bal = Number(r.amountDue) - Number(r.amountPaid);
    const cur = overdueMap.get(l.id);
    if (cur) {
      cur.total += bal;
      cur.count += 1;
      if ((levelOrder[r.status] ?? 0) > (levelOrder[cur.worstStatus] ?? 0)) cur.worstStatus = r.status;
    } else {
      overdueMap.set(l.id, {
        lesseeId: l.id,
        legalName: l.legalName,
        unitLabel: `${r.contract.unit.code} · ${shortPropertyName(r.contract.unit.property.name)}`,
        total: bal,
        count: 1,
        worstStatus: r.status,
      });
    }
  }
  const topOverdue = Array.from(overdueMap.values()).sort((a, b) => b.total - a.total).slice(0, 8);

  // ── Rex móvil ─────────────────────────────────────────────────────────────
  if (await getIsMobileView()) {
    const [morosity, overdueMaintenances, tenant] = await Promise.all([
      getMobileMorosity(),
      getMobileOverdueMaintenanceCount(),
      prisma.tenant.findUnique({ where: { id: dbUser.tenantId }, select: { name: true } }),
    ]);
    const isOwnerView = !(await hasPermission(dbUser.id, "payment.register"));
    return (
      <MobileDashboard
        tenantName={tenant?.name ?? ""}
        userName={dbUser.name}
        isOwnerView={isOwnerView}
        mode={mode}
        selectedMonth={selectedMonth}
        periodLabel={periodLabel}
        monthLabel={`${MONTHS[currentMonth] ?? ""} ${currentYear}`}
        legalEntities={legalEntities}
        activeLegalEntityId={legalEntityParam ?? null}
        pending={{
          porCobrar: cobranzaMonthRents.filter(
            (r) => r.status === "PENDING" || r.status === "DUE" || r.status === "PARTIAL",
          ).length,
          avisosSinEnviar: morosity.filter((m) => !m.lastNoticeAt).length,
          mantenimientosAtrasados: overdueMaintenances,
        }}
        kpis={{ ventas: ventasTotal, egresos: egresosTotal, utilidad, rentabilidad }}
        cobranza={{
          pct: cobranzaPct,
          collected: cobranzaCollected,
          expected: cobranzaExpected,
          paid: cobranzaPaid,
          partial: cobranzaPartial,
          pending: cobranzaPending,
          overdue: cobranzaOverdue,
        }}
        alerts={alerts}
        topOverdue={topOverdue.slice(0, 5)}
        byLegalEntity={byLegalEntity}
        ranking={rankingPlazas}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
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

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard
          label="Ventas con IVA"
          value={<span className="tabular-nums">{formatMXN(ventasTotal)}</span>}
          subValue="Ingresos cobrados"
          icon={TrendingUp}
        />
        <MetricCard
          label="Costo de Operación"
          value={<span className="tabular-nums">{formatMXN(egresosTotal)}</span>}
          subValue="Egresos pagados"
          icon={TrendingDown}
        />
        <MetricCard
          label="Utilidad Bruta"
          value={<span className="tabular-nums">{formatMXN(utilidad)}</span>}
          subValue={`Rentabilidad ${PCT.format(rentabilidad)}`}
          icon={BarChart2}
          color={utilidad >= 0 ? "success" : "danger"}
        />
      </div>

      {/* ── Histórico anual ── */}
      {mode === "anual" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Ventas vs Egresos — histórico 2009–{currentYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FinancialHistoryChart current={{ year: currentYear, ventas: ventasTotal, egresos: egresosTotal }} />
          </CardContent>
        </Card>
      )}

      {/* ── Cobranza mes en curso ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Cobranza — {MONTHS[currentMonth] ?? ""} {currentYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {formatMXN(cobranzaCollected)} cobrados de {formatMXN(cobranzaExpected)} esperados
            </p>
            <p className={`text-4xl font-bold tabular-nums ${cobranzaToneText[cobranzaTone]}`}>
              {cobranzaPct}%
            </p>
          </div>
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted ring-1 ring-border">
            <div
              className={`h-full rounded-full transition-all ${cobranzaToneBar[cobranzaTone]}`}
              style={{ width: `${Math.min(cobranzaPct, 100)}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg border bg-background/70 px-2 py-2">
              <p className="font-semibold tabular-nums text-emerald-600">{cobranzaPaid}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Pagado</p>
            </div>
            <div className="rounded-lg border bg-background/70 px-2 py-2">
              <p className="font-semibold tabular-nums text-amber-600">{cobranzaPartial}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Parcial</p>
            </div>
            <div className="rounded-lg border bg-background/70 px-2 py-2">
              <p className="font-semibold tabular-nums">{cobranzaPending}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Pendiente</p>
            </div>
            <div className="rounded-lg border bg-background/70 px-2 py-2">
              <p className="font-semibold tabular-nums text-rose-600">{cobranzaOverdue}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Vencido</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Alertas + Inquilinos con Adeudo ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Alertas</CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length > 0 ? (
              <div className="space-y-3">
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-lg p-3 text-sm ${
                      a.level === "critical"
                        ? "bg-rose-50 text-rose-800"
                        : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {a.level === "critical"
                      ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                      : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    }
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-100">
                  <span className="text-lg">✓</span>
                </div>
                <p className="text-sm font-medium text-emerald-700">Todo en orden</p>
                <p className="mt-1 text-xs text-muted-foreground">No hay alertas activas</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Inquilinos con Adeudo</CardTitle>
          </CardHeader>
          <CardContent>
            {topOverdue.length > 0 ? (
              <div className="space-y-0.5">
                {topOverdue.map((row) => {
                  const badge = overdueBadge(row.worstStatus);
                  return (
                    <div
                      key={row.legalName}
                      className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{row.legalName}</span>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <span className="shrink-0 tabular-nums font-semibold text-rose-600">{formatMXN(row.total)}</span>
                        <span className="shrink-0 text-right text-xs text-muted-foreground sm:w-16">
                          {row.count} {row.count === 1 ? "renta" : "rentas"}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium sm:w-20 ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">Sin adeudos activos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Renta Mensual Esperada + Egresos por Categoría ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Renta Mensual Esperada</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rankingPlazas.map((p) => (
                <div key={p.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="ml-2 shrink-0 tabular-nums text-xs text-muted-foreground">
                      {formatMXN(p.expectedMonthly)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((p.expectedMonthly / maxExpected) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.rentedUnits}/{p.totalUnits} ocupados
                  </p>
                </div>
              ))}
              {rankingPlazas.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">Sin contratos activos</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Egresos por Categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {expensesByTypeArr.length > 0 ? (
              <div className="space-y-3">
                {expensesByTypeArr.map((item) => (
                  <div key={item.type}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">{formatMXN(item.total)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-rose-400"
                        style={{ width: `${Math.round((item.total / maxExpType) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">Sin egresos en el período</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Resumen por Razón Social ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Por Razón Social — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <LegalEntitySummaryTable rows={byLegalEntity} />
        </CardContent>
      </Card>

    </div>
  );
}
