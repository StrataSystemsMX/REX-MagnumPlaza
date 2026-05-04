import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FinancialHistoryChart } from "@/components/dashboard/charts";
import { getActiveLegalEntityId } from "@/lib/auth/active-legal-entity";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";

// ─── Formatters ──────────────────────────────────────────────────────────────

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
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

function unitBadge(key: string): { label: string; cls: string } {
  switch (key) {
    case "PAGADO":    return { label: "Pagado",    cls: "bg-emerald-100 text-emerald-700" };
    case "NO_PAGO":   return { label: "No pago",   cls: "bg-rose-100 text-rose-700" };
    case "PENDIENTE": return { label: "Pendiente", cls: "bg-amber-100 text-amber-700" };
    default:          return { label: "Sin renta", cls: "bg-slate-100 text-slate-500" };
  }
}

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
    roles.includes("ACCOUNTANT") || roles.length === 0;
  if (!canSeeAll) redirect("/portal");

  const legalEntityParam = params.legalEntity ?? (await getActiveLegalEntityId()) ?? undefined;
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

  const [
    ventas,
    egresos,
    cxcAgg,
    propertiesWithUnits,
    overdueRentsRaw,
    paymentsDetail,
    expensesDetail,
    legalEntities,
  ] = await Promise.all([
    // KPI cards — respetan el filtro de LE
    prisma.payment.aggregate({
      where: { tenantId: dbUser.tenantId, paymentDate: { gte: periodStart, lt: periodEnd }, ...paymentLeFilter },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { tenantId: dbUser.tenantId, expenseDate: { gte: periodStart, lt: periodEnd }, ...leFilter },
      _sum: { amount: true },
    }),
    prisma.rent.aggregate({
      where: {
        tenantId: dbUser.tenantId,
        status: { in: ["DUE", "PARTIAL", "OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"] },
        ...leFilter,
      },
      _sum: { amountDue: true, amountPaid: true },
    }),

    // Semáforo de locales — filtrado por managerEntityId
    prisma.property.findMany({
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
    }),

    // Adeudos — para el top overdue
    prisma.rent.findMany({
      where: {
        tenantId: dbUser.tenantId,
        status: { in: ["DUE", "PARTIAL", "OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"] },
        ...leFilter,
      },
      select: {
        amountDue: true,
        amountPaid: true,
        status: true,
        contract: { select: { lessee: { select: { id: true, legalName: true } } } },
      },
    }),

    // Detalle de pagos para resumen por LE y ranking de plazas (sin filtro de LE)
    prisma.payment.findMany({
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
    }),

    // Detalle de egresos para resumen por LE y egresos por tipo (sin filtro de LE)
    prisma.expense.findMany({
      where: { tenantId: dbUser.tenantId, expenseDate: { gte: periodStart, lt: periodEnd } },
      select: {
        amount: true,
        legalEntityId: true,
        category: { select: { type: true } },
      },
    }),

    // Razones sociales activas
    prisma.legalEntity.findMany({
      where: { tenantId: dbUser.tenantId, isActive: true },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    }),
  ]);

  // ── KPI cards ──────────────────────────────────────────────────────────────
  const ventasTotal  = Number(ventas._sum.amount  ?? 0);
  const egresosTotal = Number(egresos._sum.amount  ?? 0);
  const utilidad     = ventasTotal - egresosTotal;
  const rentabilidad = ventasTotal > 0 ? utilidad / ventasTotal : 0;
  const cxc          = Number(cxcAgg._sum.amountDue ?? 0) - Number(cxcAgg._sum.amountPaid ?? 0);

  const periodLabel = mode === "anual"
    ? `Ene – Dic ${currentYear}`
    : `${MONTHS[selectedMonth] ?? ""} ${currentYear}`;

  const tablero = [
    { label: "Ventas con IVA",     value: MXN.format(ventasTotal),  note: "Ingresos cobrados",       color: "" },
    { label: "Costo de Operación", value: MXN.format(egresosTotal), note: "Egresos registrados",     color: "" },
    { label: "Utilidad Bruta",     value: MXN.format(utilidad),     note: `Rentabilidad ${PCT.format(rentabilidad)}`, color: utilidad >= 0 ? "text-emerald-600" : "text-rose-600" },
    { label: "CxC con IVA",        value: MXN.format(cxc),          note: "Por cobrar a inquilinos", color: cxc > 0 ? "text-amber-600" : "text-emerald-600" },
  ];

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
    return { code: le.code, income, expenses, profit, rent: income > 0 ? profit / income : 0 };
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
  const overdueMap = new Map<string, { legalName: string; total: number; count: number; worstStatus: string }>();
  for (const r of overdueRentsRaw) {
    const l  = r.contract.lessee;
    const bal = Number(r.amountDue) - Number(r.amountPaid);
    const cur = overdueMap.get(l.id);
    if (cur) {
      cur.total += bal;
      cur.count += 1;
      if ((levelOrder[r.status] ?? 0) > (levelOrder[cur.worstStatus] ?? 0)) cur.worstStatus = r.status;
    } else {
      overdueMap.set(l.id, { legalName: l.legalName, total: bal, count: 1, worstStatus: r.status });
    }
  }
  const topOverdue = Array.from(overdueMap.values()).sort((a, b) => b.total - a.total).slice(0, 8);

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

        <div className="flex items-center gap-2">
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
            <div className="flex flex-wrap gap-1">
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tablero.map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`mt-2 text-2xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Histórico anual ── */}
      {mode === "anual" && (
        <Card>
          <CardContent className="pt-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Ventas vs Egresos — histórico 2009–{currentYear}
            </p>
            <FinancialHistoryChart current={{ year: currentYear, ventas: ventasTotal, egresos: egresosTotal }} />
          </CardContent>
        </Card>
      )}

      {/* ── Resumen por Razón Social + Ranking de Plazas ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Razón Social */}
        <Card>
          <CardContent className="pt-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Por Razón Social
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Entidad</th>
                    <th className="pb-2 text-right font-medium">Ingresos</th>
                    <th className="pb-2 text-right font-medium">Egresos</th>
                    <th className="pb-2 text-right font-medium">Utilidad</th>
                    <th className="pb-2 text-right font-medium">Rent.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {byLegalEntity.map((le) => (
                    <tr key={le.code} className="hover:bg-muted/30">
                      <td className="py-2.5 font-semibold">{le.code}</td>
                      <td className="py-2.5 text-right tabular-nums">{MXN.format(le.income)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{MXN.format(le.expenses)}</td>
                      <td className={`py-2.5 text-right tabular-nums font-medium ${le.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {MXN.format(le.profit)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {le.income > 0 ? PCT.format(le.rent) : "—"}
                      </td>
                    </tr>
                  ))}
                  {byLegalEntity.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        Sin movimientos en el período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Ranking de Plazas */}
        <Card>
          <CardContent className="pt-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Ranking de Plazas — Renta mensual esperada
            </p>
            <div className="space-y-3">
              {rankingPlazas.map((p) => (
                <div key={p.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <Link href={`/properties/${p.id}`} className="truncate font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="ml-2 shrink-0 tabular-nums text-xs text-muted-foreground">
                      {MXN.format(p.expectedMonthly)}
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
      </div>

      {/* ── Egresos por Tipo + Alertas ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Egresos por categoría */}
        <Card>
          <CardContent className="pt-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Egresos por Categoría
            </p>
            {expensesByTypeArr.length > 0 ? (
              <div className="space-y-3">
                {expensesByTypeArr.map((item) => (
                  <div key={item.type}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-sm">{item.label}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">{MXN.format(item.total)}</span>
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

        {/* Alertas */}
        <Card>
          <CardContent className="pt-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Alertas
            </p>
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
      </div>

      {/* ── Cobranza por Plaza ── */}
      {propertiesWithUnits.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Cobranza por Plaza — {MONTHS[currentMonth] ?? ""} {currentYear}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {propertiesWithUnits.map((property) => {
              const totalUnits  = property.units.length;
              const rentedUnits = property.units.filter((u) => u.status === "RENTADA").length;
              return (
                <Card key={property.id}>
                  <CardContent className="pt-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <Link href={`/properties/${property.id}`} className="truncate font-semibold hover:underline">
                        {property.name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {rentedUnits}/{totalUnits} ocupados
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {property.units.map((unit) => {
                        const contract   = unit.contracts[0];
                        const rentStatus = contract?.rents[0]?.status;

                        let statusKey: string;
                        if (unit.status !== "RENTADA" || !contract) statusKey = "NO_RENTADO";
                        else if (!rentStatus)                          statusKey = "PENDIENTE";
                        else if (rentStatus === "PAID")                statusKey = "PAGADO";
                        else                                           statusKey = "NO_PAGO";

                        const badge      = unitBadge(statusKey);
                        const lesseeName = contract?.lessee.legalName ?? "— disponible —";
                        const amount     = contract ? MXN.format(Number(contract.monthlyAmount)) : "—";

                        return (
                          <div key={unit.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/40">
                            <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{unit.code}</span>
                            <span className="min-w-0 flex-1 truncate">{lesseeName}</span>
                            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{amount}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Top Inquilinos con Adeudo ── */}
      {topOverdue.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Inquilinos con Adeudo
          </p>
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-0.5">
                {topOverdue.map((row) => {
                  const badge = overdueBadge(row.worstStatus);
                  return (
                    <div key={row.legalName} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                      <span className="min-w-0 flex-1 truncate font-medium">{row.legalName}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-rose-600">{MXN.format(row.total)}</span>
                      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                        {row.count} {row.count === 1 ? "renta" : "rentas"}
                      </span>
                      <span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
