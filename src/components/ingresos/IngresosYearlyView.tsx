"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Clock, Wallet, AlertTriangle, Percent, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BulkPaymentDialog } from "@/components/collections/BulkPaymentDialog";
import {
  RegisterPaymentDialog,
  type RegisterPaymentDialogContext,
} from "@/components/collections/RegisterPaymentDialog";
import { capitalizeFirst, cn } from "@/lib/utils";
import type {
  MonthlyUnitStatus,
  YearlyCell,
  YearlyCollections,
  YearlyPropertyGroup,
  YearlyUnitRow,
} from "@/lib/services/payments-queries";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const MXN_INT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const PERIOD_FULL = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_LONG = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  timeZone: "UTC",
});

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Línea divisora gris superpuesta (pseudo-elemento absoluto, no afecta el
// layout de la tabla) en el borde derecho de la columna del mes actual: separa
// el mes en curso de los meses siguientes. Se aplica solo cuando el año
// mostrado es el año en curso. `pointer-events-none` para no bloquear clicks.
const CURRENT_MONTH_DIVIDER =
  "relative after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:bg-slate-300 after:content-[''] dark:after:bg-slate-600";

interface IngresosYearlyViewProps {
  data: YearlyCollections;
  availableYears: ReadonlyArray<number>;
}

interface EntityGroup {
  code: string;
  properties: YearlyPropertyGroup[];
  expected: number;
  paid: number;
  unitCount: number;
}

const ENTITY_THEME: Record<string, { dot: string; ring: string; bg: string; text: string }> = {
  CRT: { dot: "bg-orange-500", ring: "ring-orange-200", bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-300" },
  TSR: { dot: "bg-blue-500", ring: "ring-blue-200", bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300" },
  QHS: { dot: "bg-emerald-500", ring: "ring-emerald-200", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300" },
  JCL: { dot: "bg-violet-500", ring: "ring-violet-200", bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300" },
};

const DEFAULT_THEME = { dot: "bg-slate-500", ring: "ring-slate-200", bg: "bg-slate-50 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-300" };

function themeFor(code: string) {
  return ENTITY_THEME[code] ?? DEFAULT_THEME;
}

export function IngresosYearlyView({ data, availableYears }: IngresosYearlyViewProps) {
  const [propertyFilter, setPropertyFilter] = useState<string>("ALL");
  const [entityFilter, setEntityFilter] = useState<string>("ALL");
  const [paymentContext, setPaymentContext] =
    useState<RegisterPaymentDialogContext | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [collapsedEntities, setCollapsedEntities] = useState<Set<string>>(new Set());

  function toggleEntity(code: string) {
    setCollapsedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  // Solo plazas con locales rentables — un inmueble sin Units no genera ingreso.
  const incomeProperties = useMemo(
    () => data.properties.filter((p) => p.unitCount > 0),
    [data.properties],
  );

  const propertyItems = useMemo<Record<string, string>>(
    () => ({
      ALL: "Todas las plazas",
      ...Object.fromEntries(incomeProperties.map((p) => [p.propertyId, p.propertyName])),
    }),
    [incomeProperties],
  );

  const yearItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(availableYears.map((y) => [String(y), String(y)])),
    [availableYears],
  );

  // Agrupar por managerEntity (la razón social que factura/administra).
  const entityGroups = useMemo<EntityGroup[]>(() => {
    const map = new Map<string, EntityGroup>();
    for (const p of incomeProperties) {
      const code = p.managerEntityCode;
      let g = map.get(code);
      if (!g) {
        g = { code, properties: [], expected: 0, paid: 0, unitCount: 0 };
        map.set(code, g);
      }
      g.properties.push(p);
      g.expected += Number(p.expectedTotal);
      g.paid += Number(p.paidTotal);
      g.unitCount += p.unitCount;
    }
    return Array.from(map.values()).sort((a, b) => b.expected - a.expected);
  }, [incomeProperties]);

  const entityItems = useMemo<Record<string, string>>(
    () => ({
      ALL: "Todas las razones sociales",
      ...Object.fromEntries(entityGroups.map((g) => [g.code, g.code])),
    }),
    [entityGroups],
  );

  const visibleEntityGroups = useMemo(() => {
    return entityGroups
      .filter((g) => entityFilter === "ALL" || g.code === entityFilter)
      .map((g) => ({
        ...g,
        properties:
          propertyFilter === "ALL"
            ? g.properties
            : g.properties.filter((p) => p.propertyId === propertyFilter),
      }))
      .filter((g) => g.properties.length > 0);
  }, [entityGroups, entityFilter, propertyFilter]);

  // Dashboard por mes (no anual): cobrado / por cobrar / % del mes en curso, más
  // "Atrasado" = saldo pendiente acumulado de los meses ya vencidos (anteriores
  // al mes actual). Respeta los filtros de razón social y plaza.
  const dashboard = useMemo(() => {
    const today = new Date();
    const monthIndex = today.getMonth();
    const currentMonthStart = Date.UTC(today.getFullYear(), monthIndex, 1);
    let monthExpected = 0;
    let monthPaid = 0;
    let arrears = 0;
    for (const g of visibleEntityGroups) {
      for (const p of g.properties) {
        for (const u of p.units) {
          u.cells.forEach((cell, i) => {
            if (i === monthIndex) {
              monthExpected += Number(cell.amountDue);
              monthPaid += Number(cell.amountPaid);
            }
            // Atrasado: meses cuyo periodo ya pasó (anteriores al mes actual real)
            // y todavía tienen saldo. Excluye condonado y el mes en curso/futuros.
            if (Date.UTC(data.year, i, 1) < currentMonthStart) {
              const outstanding =
                Number(cell.amountDue) -
                Number(cell.amountPaid) -
                Number(cell.amountWaived);
              if (outstanding > 0) arrears += outstanding;
            }
          });
        }
      }
    }
    const monthBalance = Math.max(0, monthExpected - monthPaid);
    const monthPct =
      monthExpected > 0 ? Math.round((monthPaid / monthExpected) * 100) : 0;
    return { monthIndex, monthPaid, monthBalance, monthPct, arrears };
  }, [visibleEntityGroups, data.year]);

  const monthLabel = capitalizeFirst(
    MONTH_LONG.format(new Date(Date.UTC(2000, dashboard.monthIndex, 1))),
  );

  function navigateYear(delta: number) {
    const target = data.year + delta;
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(target));
    window.location.href = url.toString();
  }

  function selectYear(year: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("year", year);
    window.location.href = url.toString();
  }

  // Índice (0-11) de la columna del mes actual para dibujar el divisor; null si
  // el año mostrado no es el año en curso (no hay "mes actual" que marcar).
  const now = new Date();
  const dividerMonthIndex =
    data.year === now.getFullYear() ? now.getMonth() : null;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateYear(-1)}
            aria-label="Año anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Select
            value={String(data.year)}
            onValueChange={(v) => v && selectYear(v)}
            items={yearItems}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateYear(1)}
            aria-label="Año siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={entityFilter}
            onValueChange={(v) => v && setEntityFilter(v)}
            items={entityItems}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(entityItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={propertyFilter}
            onValueChange={(v) => v && setPropertyFilter(v)}
            items={propertyItems}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(propertyItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => setBulkOpen(true)} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Registrar ingreso
          </Button>
        </div>
      </div>

      {/* KPI cards — por mes (mes en curso) + atrasado acumulado al final */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="size-4" />}
          label={`Cobrado · ${monthLabel}`}
          value={MXN_INT.format(dashboard.monthPaid)}
          accent="text-green-700 dark:text-green-300"
        />
        <KpiCard
          icon={<Clock className="size-4" />}
          label={`Por cobrar · ${monthLabel}`}
          value={MXN_INT.format(dashboard.monthBalance)}
          accent="text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          icon={<Percent className="size-4" />}
          label={`Cobranza · ${monthLabel}`}
          value={`${dashboard.monthPct}%`}
          accent="text-foreground"
          progress={dashboard.monthPct}
        />
        <KpiCard
          icon={<AlertTriangle className="size-4" />}
          label="Atrasado (meses anteriores)"
          value={MXN_INT.format(dashboard.arrears)}
          accent="text-destructive"
        />
      </div>

      {/* Desglose por razón social */}
      <EntityBreakdown groups={entityGroups} totalExpected={
        entityGroups.reduce((acc, g) => acc + g.expected, 0)
      } />

      <Legend />

      {/* Matrices agrupadas por LegalEntity */}
      <div className="space-y-6">
        {visibleEntityGroups.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sin inmuebles para los filtros aplicados.
          </div>
        ) : (
          visibleEntityGroups.map((g) => (
            <EntitySection
              key={g.code}
              group={g}
              onCellClick={setPaymentContext}
              collapsed={collapsedEntities.has(g.code)}
              onToggle={() => toggleEntity(g.code)}
              dividerMonthIndex={dividerMonthIndex}
            />
          ))
        )}
      </div>

      <MonthlyTotalsBar totals={data.monthlyTotals} />

      <RegisterPaymentDialog
        context={paymentContext}
        open={paymentContext !== null}
        onOpenChange={(o) => !o && setPaymentContext(null)}
      />
      <BulkPaymentDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// KPI Card
// ----------------------------------------------------------------------------

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  progress?: number;
}

function KpiCard({ icon, label, value, accent, progress }: KpiCardProps) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">{icon}</span>
          {label}
        </div>
        <p className={cn("text-xl font-semibold tabular-nums leading-none", accent)}>
          {value}
        </p>
        {typeof progress === "number" && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progress >= 80
                  ? "bg-green-500"
                  : progress >= 50
                    ? "bg-amber-500"
                    : "bg-red-500",
              )}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Entity breakdown — desglose horizontal por razón social
// ----------------------------------------------------------------------------

function EntityBreakdown({
  groups,
  totalExpected,
}: {
  groups: EntityGroup[];
  totalExpected: number;
}) {
  if (groups.length === 0) return null;
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Desglose por razón social
          </p>
          <p className="text-xs text-muted-foreground">
            Total: <span className="font-semibold tabular-nums text-foreground">{MXN_INT.format(totalExpected)}</span>
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => {
            const t = themeFor(g.code);
            const sharePct = totalExpected > 0 ? Math.round((g.expected / totalExpected) * 100) : 0;
            const collectedPct = g.expected > 0 ? Math.round((g.paid / g.expected) * 100) : 0;
            return (
              <div
                key={g.code}
                className={cn("rounded-lg border p-3 ring-1", t.bg, t.ring)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-full", t.dot)} />
                    <span className={cn("font-semibold", t.text)}>{g.code}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {g.properties.length} plaza{g.properties.length === 1 ? "" : "s"} · {g.unitCount} locales
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {MXN_INT.format(g.expected)}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{sharePct}% del total</span>
                  <span className="text-green-700 dark:text-green-300">
                    {collectedPct}% cobrado
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-background/60">
                  <div
                    className={cn("h-full rounded-full", t.dot)}
                    style={{ width: `${Math.min(100, collectedPct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Legend
// ----------------------------------------------------------------------------

function Legend() {
  const items: Array<{ status: MonthlyUnitStatus; label: string }> = [
    { status: "PAID", label: "Pagado" },
    { status: "PARTIAL", label: "Parcial" },
    { status: "SIN_PAGO", label: "Sin pago" },
    { status: "FUTURO", label: "No vencido" },
    { status: "VACANT", label: "Vacío" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {items.map((i) => (
        <div key={i.status} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded", CELL_BG[i.status])} />
          {i.label}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="relative size-3 rounded ring-1 ring-black">
          <X className="absolute inset-0 m-auto size-3 text-black" strokeWidth={3.5} />
        </span>
        Condonado
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Entity section — agrupa todas las plazas de una razón social
// ----------------------------------------------------------------------------

interface EntitySectionProps {
  group: EntityGroup;
  onCellClick: (ctx: RegisterPaymentDialogContext) => void;
  collapsed: boolean;
  onToggle: () => void;
  dividerMonthIndex: number | null;
}

function EntitySection({ group, onCellClick, collapsed, onToggle, dividerMonthIndex }: EntitySectionProps) {
  const theme = themeFor(group.code);
  const collected = group.expected > 0 ? Math.round((group.paid / group.expected) * 100) : 0;

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={cn(
          "flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left ring-1 transition-colors hover:brightness-[0.98]",
          theme.bg,
          theme.ring,
        )}
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              collapsed && "-rotate-90",
            )}
          />
          <span className={cn("inline-flex size-7 items-center justify-center rounded-md text-xs font-bold text-white", theme.dot)}>
            {group.code.slice(0, 1)}
          </span>
          <div>
            <h2 className={cn("text-sm font-semibold leading-tight", theme.text)}>
              {group.code}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {group.properties.length} plaza{group.properties.length === 1 ? "" : "s"} · {group.unitCount} locales
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Esperado</p>
            <p className="font-semibold tabular-nums">{MXN_INT.format(group.expected)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cobrado</p>
            <p className="font-semibold tabular-nums text-green-700 dark:text-green-300">
              {MXN_INT.format(group.paid)}
              <span className="ml-1 text-muted-foreground">({collected}%)</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Por cobrar</p>
            <p className="font-semibold tabular-nums text-destructive">
              {MXN_INT.format(group.expected - group.paid)}
            </p>
          </div>
        </div>
      </button>

      {!collapsed && (
        <div className="space-y-3">
          {group.properties.map((p) => (
            <PropertyMatrix
              key={p.propertyId}
              group={p}
              onCellClick={onCellClick}
              dividerMonthIndex={dividerMonthIndex}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Property matrix
// ----------------------------------------------------------------------------

const PROPERTY_DOT_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-orange-500",
];

function dotColorFor(propertyId: string): string {
  let hash = 0;
  for (let i = 0; i < propertyId.length; i++) {
    hash = (hash * 31 + propertyId.charCodeAt(i)) >>> 0;
  }
  return PROPERTY_DOT_COLORS[hash % PROPERTY_DOT_COLORS.length]!;
}

interface PropertyMatrixProps {
  group: YearlyPropertyGroup;
  onCellClick: (ctx: RegisterPaymentDialogContext) => void;
  dividerMonthIndex: number | null;
}

function PropertyMatrix({ group, onCellClick, dividerMonthIndex }: PropertyMatrixProps) {
  const collected =
    Number(group.expectedTotal) > 0
      ? Math.round((Number(group.paidTotal) / Number(group.expectedTotal)) * 100)
      : 0;

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", dotColorFor(group.propertyId))} />
          <h3 className="font-semibold">{group.propertyName}</h3>
          <span className="text-xs text-muted-foreground">
            {group.unitCount} {group.unitCount === 1 ? "local" : "locales"}
          </span>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-muted-foreground">Esperado: </span>
            <span className="font-semibold tabular-nums">
              {MXN_INT.format(Number(group.expectedTotal))}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Cobrado: </span>
            <span className="font-semibold tabular-nums text-green-700 dark:text-green-300">
              {MXN_INT.format(Number(group.paidTotal))}
            </span>
            <span className="ml-1 text-muted-foreground">({collected}%)</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-20" />
            <col className="w-48" />
            <col className="w-24" />
            {MONTHS_SHORT.map((m) => (
              <col key={m} className="w-12" />
            ))}
            <col className="w-32" />
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/10">
              <th className="sticky left-0 z-20 border-r border-border bg-card px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Local
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Inquilino</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Renta</th>
              {MONTHS_SHORT.map((m, i) => (
                <th
                  key={m}
                  className={cn(
                    "px-1 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground",
                    i === dividerMonthIndex && CURRENT_MONTH_DIVIDER,
                  )}
                >
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {group.units.map((u) => (
              <UnitMatrixRow
                key={u.unitId}
                row={u}
                propertyName={group.propertyName}
                onCellClick={onCellClick}
                dividerMonthIndex={dividerMonthIndex}
              />
            ))}
            <tr className="border-t bg-muted/20 font-medium">
              <td className="sticky left-0 z-20 border-r border-border bg-card px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                Subtotal
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              {MONTHS_SHORT.map((_, i) => {
                const expected = group.units.reduce(
                  (acc, u) => acc + Number(u.cells[i]?.amountDue ?? 0),
                  0,
                );
                const paid = group.units.reduce(
                  (acc, u) => acc + Number(u.cells[i]?.amountPaid ?? 0),
                  0,
                );
                const ok = expected > 0 && paid >= expected;
                return (
                  <td
                    key={i}
                    className={cn(
                      "px-1 py-2 text-center text-[10px] tabular-nums",
                      ok ? "text-green-700 dark:text-green-300" : "text-muted-foreground",
                      i === dividerMonthIndex && CURRENT_MONTH_DIVIDER,
                    )}
                  >
                    {expected > 0 ? compactMxn(paid) : "—"}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right text-xs tabular-nums">
                <div className="font-semibold text-green-700 dark:text-green-300">
                  {MXN_INT.format(Number(group.paidTotal))}
                </div>
                <div className="text-muted-foreground">
                  de {MXN_INT.format(Number(group.expectedTotal))}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function compactMxn(n: number): string {
  if (n === 0) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

// ----------------------------------------------------------------------------
// Unit row
// ----------------------------------------------------------------------------

interface UnitMatrixRowProps {
  row: YearlyUnitRow;
  propertyName: string;
  onCellClick: (ctx: RegisterPaymentDialogContext) => void;
  dividerMonthIndex: number | null;
}

function UnitMatrixRow({ row, propertyName, onCellClick, dividerMonthIndex }: UnitMatrixRowProps) {
  const monthlyRent = Number(
    row.cells.find((c) => Number(c.amountDue) > 0)?.amountDue ?? 0,
  );
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/20">
      <td className="sticky left-0 z-20 border-r border-border bg-card px-3 py-1.5 font-mono text-xs">
        {row.unitCode}
      </td>
      <td className="max-w-[200px] truncate px-3 py-1.5">
        {row.currentLesseeName ? (
          <span className="text-sm">{row.currentLesseeName}</span>
        ) : (
          <span className="text-xs italic text-muted-foreground">Vacío</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
        {monthlyRent > 0 ? MXN_INT.format(monthlyRent) : "—"}
      </td>
      {row.cells.map((cell, i) => (
        <td
          key={i}
          className={cn("px-1 py-1.5", i === dividerMonthIndex && CURRENT_MONTH_DIVIDER)}
        >
          <MatrixCell
            cell={cell}
            unitCode={row.unitCode}
            propertyName={propertyName}
            lesseeName={row.currentLesseeName}
            onClick={onCellClick}
          />
        </td>
      ))}
      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
        <div className="font-medium text-green-700 dark:text-green-300">
          {MXN_INT.format(Number(row.paidTotal))}
        </div>
        <div className="text-muted-foreground">
          de {MXN_INT.format(Number(row.expectedTotal))}
        </div>
      </td>
    </tr>
  );
}

// ----------------------------------------------------------------------------
// Cell
// ----------------------------------------------------------------------------

const CELL_BG: Record<MonthlyUnitStatus, string> = {
  PAID: "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-500",
  PARTIAL: "bg-amber-400 hover:bg-amber-500 dark:bg-amber-500",
  SIN_PAGO: "bg-red-500 hover:bg-red-600 dark:bg-red-600",
  FUTURO: "bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600",
  WAIVED: "bg-blue-300 hover:bg-blue-400 dark:bg-blue-400 dark:hover:bg-blue-300",
  VACANT: "bg-muted hover:bg-muted-foreground/20",
};

interface MatrixCellProps {
  cell: YearlyCell;
  unitCode: string;
  propertyName: string;
  lesseeName: string | null;
  onClick: (ctx: RegisterPaymentDialogContext) => void;
}

function MatrixCell({ cell, unitCode, propertyName, lesseeName, onClick }: MatrixCellProps) {
  const tooltip = buildTooltip(cell, lesseeName);
  const clickable = cell.rentId !== null;
  // Mostrar cruz si la renta tiene cualquier monto condonado (parcial o total).
  const hasWaiver = Number(cell.amountWaived) > 0;

  if (!clickable) {
    return (
      <div
        title={tooltip}
        className={cn(
          "relative mx-auto h-6 w-6 rounded transition-colors",
          CELL_BG[cell.status],
          cell.overdueLevel === 3 && "ring-2 ring-red-700",
          hasWaiver && "ring-2 ring-black",
        )}
      >
        {hasWaiver ? (
          <X
            className="absolute inset-0 m-auto size-5 text-black"
            strokeWidth={3.5}
          />
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={tooltip}
      onClick={() =>
        onClick({
          rentId: cell.rentId!,
          amountDue: cell.amountDue,
          amountPaid: cell.amountPaid,
          amountWaived: cell.amountWaived,
          period: cell.period,
          lesseeName: lesseeName ?? "",
          unitLabel: `${propertyName} ${unitCode}`,
        })
      }
      className={cn(
        "relative mx-auto block h-6 w-6 rounded transition-colors",
        CELL_BG[cell.status],
        cell.overdueLevel === 3 && "ring-2 ring-red-700",
        hasWaiver && "ring-2 ring-black",
      )}
    >
      {hasWaiver ? (
        <X
          className="pointer-events-none absolute inset-0 m-auto size-5 text-black"
          strokeWidth={3.5}
        />
      ) : null}
    </button>
  );
}

function buildTooltip(cell: YearlyCell, lesseeName: string | null): string {
  const period = capitalizeFirst(PERIOD_FULL.format(cell.period));
  if (cell.status === "VACANT") {
    return `${period} — Vacío`;
  }
  const head = lesseeName ? `${lesseeName} — ${period}` : period;
  switch (cell.status) {
    case "PAID":
      return `${head}\nPagado ${MXN.format(Number(cell.amountPaid))}`;
    case "PARTIAL":
      return `${head}\nParcial: ${MXN.format(Number(cell.amountPaid))} de ${MXN.format(Number(cell.amountDue))}`;
    case "SIN_PAGO":
      return `${head}\nSin pago — ${MXN.format(Number(cell.amountDue))}${cell.overdueLevel ? ` · Escalón ${cell.overdueLevel}` : ""}`;
    case "FUTURO":
      return `${head}\nNo vencido — ${MXN.format(Number(cell.amountDue))}`;
    case "WAIVED":
      return `${head}\nCondonado ${MXN.format(Number(cell.amountWaived))}`;
    default:
      return head;
  }
}

// ----------------------------------------------------------------------------
// Monthly totals bar (footer)
// ----------------------------------------------------------------------------

function MonthlyTotalsBar({
  totals,
}: {
  totals: YearlyCollections["monthlyTotals"];
}) {
  const peakExpected = Math.max(...totals.map((t) => Number(t.expected)), 1);
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <h3 className="text-sm font-semibold">Totales mensuales</h3>
        <p className="text-xs text-muted-foreground">
          12 meses · esperado vs. cobrado
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/10">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Mes</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Esperado</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobrado</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">% Cobrado</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagados</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Sin pago</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t, i) => {
              const expected = Number(t.expected);
              const paid = Number(t.paid);
              const pct = expected > 0 ? Math.round((paid / expected) * 100) : 0;
              const barWidth = (expected / peakExpected) * 100;
              const fillWidth = expected > 0 ? (paid / expected) * 100 : 0;
              return (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5">{capitalizeFirst(PERIOD_FULL.format(t.period))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {MXN_INT.format(expected)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-green-700 dark:text-green-300">
                    {MXN_INT.format(paid)}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="relative h-2 overflow-hidden rounded-full bg-muted"
                        style={{ width: `${Math.max(20, barWidth)}%` }}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full",
                            pct >= 80
                              ? "bg-green-500"
                              : pct >= 50
                                ? "bg-amber-500"
                                : pct > 0
                                  ? "bg-red-500"
                                  : "bg-transparent",
                          )}
                          style={{ width: `${Math.min(100, fillWidth)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.paidCount}</td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right tabular-nums",
                      t.sinPagoCount > 0 && "text-red-700 dark:text-red-300",
                    )}
                  >
                    {t.sinPagoCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
