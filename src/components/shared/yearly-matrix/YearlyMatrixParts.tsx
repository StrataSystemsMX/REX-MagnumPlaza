"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMXN } from "@/shared/format-currency";
import { formatPeriodLong } from "@/shared/format-date";
import { cn } from "@/shared/utils";
import { themeFor } from "./theme";

/**
 * Piezas compartidas entre IngresosYearlyView y EgresosYearlyView. Lo que
 * difiere de verdad entre ambas (celdas, tooltips, leyendas, matrices) vive
 * en cada vista; aquí solo está la estructura común parametrizada.
 */

// ----------------------------------------------------------------------------
// Year navigator — chevrons + select de año (navega vía ?year=)
// ----------------------------------------------------------------------------

export function YearNavigator({
  year,
  availableYears,
}: {
  year: number;
  availableYears: ReadonlyArray<number>;
}) {
  const yearItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(availableYears.map((y) => [String(y), String(y)])),
    [availableYears],
  );

  function navigateYear(delta: number) {
    const target = year + delta;
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(target));
    window.location.href = url.toString();
  }

  function selectYear(value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("year", value);
    window.location.href = url.toString();
  }

  return (
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
        value={String(year)}
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
  );
}

// ----------------------------------------------------------------------------
// KPI Card
// ----------------------------------------------------------------------------

export interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  progress?: number;
}

export function KpiCard({ icon, label, value, accent, progress }: KpiCardProps) {
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

export interface EntityBreakdownItem {
  code: string;
  /** Monto principal de la tarjeta (esperado/estimado). */
  total: number;
  /** Línea de contexto ("3 plazas · 12 locales" / "8 conceptos"). */
  meta: string;
  /** % cobrado/pagado (barra de progreso). */
  paidPct: number;
}

export function EntityBreakdownCard({
  items,
  totalExpected,
  paidWord,
}: {
  items: ReadonlyArray<EntityBreakdownItem>;
  totalExpected: number;
  /** "cobrado" (ingresos) | "pagado" (egresos). */
  paidWord: string;
}) {
  if (items.length === 0) return null;
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Desglose por razón social
          </p>
          <p className="text-xs text-muted-foreground">
            Total:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatMXN(totalExpected)}
            </span>
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((g) => {
            const t = themeFor(g.code);
            const sharePct =
              totalExpected > 0 ? Math.round((g.total / totalExpected) * 100) : 0;
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
                  <span className="text-xs text-muted-foreground">{g.meta}</span>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {formatMXN(g.total)}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{sharePct}% del total</span>
                  <span className="text-green-700 dark:text-green-300">
                    {g.paidPct}% {paidWord}
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-background/60">
                  <div
                    className={cn("h-full rounded-full", t.dot)}
                    style={{ width: `${Math.min(100, g.paidPct)}%` }}
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
// Entity section header — botón colapsable con tema de la razón social
// ----------------------------------------------------------------------------

export interface EntitySectionStat {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function EntitySectionHeader({
  code,
  meta,
  stats,
  collapsed,
  onToggle,
}: {
  code: string;
  meta: string;
  stats: ReadonlyArray<EntitySectionStat>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const theme = themeFor(code);
  return (
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
        <span
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md text-xs font-bold text-white",
            theme.dot,
          )}
        >
          {code.slice(0, 1)}
        </span>
        <div>
          <h2 className={cn("text-sm font-semibold leading-tight", theme.text)}>
            {code}
          </h2>
          <p className="text-[11px] text-muted-foreground">{meta}</p>
        </div>
      </div>
      <div className="flex items-center gap-6 text-xs">
        {stats.map((s) => (
          <div key={s.label} className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <p className={cn("font-semibold tabular-nums", s.className)}>{s.value}</p>
          </div>
        ))}
      </div>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Monthly totals bar (footer) — 12 meses, esperado vs cobrado/pagado
// ----------------------------------------------------------------------------

export interface MonthlyTotalsRow {
  period: Date | string;
  expected: number;
  paid: number;
  paidCount: number;
  /** Conteo de la última columna (sin pago / pendientes). */
  lastCount: number;
}

export function MonthlyTotalsBar({
  rows,
  subtitle,
  expectedHeader,
  paidHeader,
  pctHeader,
  lastHeader,
  lastAccentClass,
}: {
  rows: ReadonlyArray<MonthlyTotalsRow>;
  subtitle: string;
  expectedHeader: string;
  paidHeader: string;
  pctHeader: string;
  lastHeader: string;
  lastAccentClass: string;
}) {
  const peakExpected = Math.max(...rows.map((t) => t.expected), 1);
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
        <h3 className="text-sm font-semibold">Totales mensuales</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/10">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Mes</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">{expectedHeader}</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">{paidHeader}</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{pctHeader}</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagados</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">{lastHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const pct = t.expected > 0 ? Math.round((t.paid / t.expected) * 100) : 0;
              const barWidth = (t.expected / peakExpected) * 100;
              const fillWidth = t.expected > 0 ? (t.paid / t.expected) * 100 : 0;
              return (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5">{formatPeriodLong(t.period)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMXN(t.expected)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-green-700 dark:text-green-300">
                    {formatMXN(t.paid)}
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
                      t.lastCount > 0 && lastAccentClass,
                    )}
                  >
                    {t.lastCount}
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
