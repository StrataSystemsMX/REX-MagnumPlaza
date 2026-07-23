"use client";

import React, { useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatMXN, formatPercent } from "@/lib/format-currency";
import { themeFor } from "@/components/cierres/MonthlyPivotTable";
import { MONTH_KEYS } from "@/lib/services/budgets-types";
import type { BudgetLineRow, EntityBudgetSummary } from "@/lib/services/budgets-types";

const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// Clases completas para el indicador de Progress por entidad — Tailwind necesita
// ver la cadena literal completa para generar la regla CSS del arbitrary variant.
const PROGRESS_INDICATOR_BY_CODE: Record<string, string> = {
  CRT: "[&>[data-slot=progress-indicator]]:bg-orange-500",
  TSR: "[&>[data-slot=progress-indicator]]:bg-blue-500",
  QHS: "[&>[data-slot=progress-indicator]]:bg-emerald-500",
  JCL: "[&>[data-slot=progress-indicator]]:bg-violet-500",
};
const PROGRESS_INDICATOR_DEFAULT = "[&>[data-slot=progress-indicator]]:bg-slate-500";
const PROGRESS_INDICATOR_NEGATIVE = "[&>[data-slot=progress-indicator]]:bg-rose-500";

interface Props {
  entity: EntityBudgetSummary;
  defaultExpanded?: boolean;
}

export function EntityBudgetCard({ entity, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showMonths, setShowMonths] = useState(false);

  const marginPct = entity.annualIncome > 0
    ? Math.max(0, Math.min(100, (entity.annualProfit / entity.annualIncome) * 100))
    : 0;
  const profitPositive = entity.annualProfit >= 0;
  const theme = themeFor(entity.code);

  return (
    <Card className={cn("overflow-hidden ring-1", theme.ring, theme.soft)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="block w-full text-left transition-colors hover:brightness-95"
        aria-expanded={expanded}
      >
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={cn("flex size-9 items-center justify-center rounded-md", theme.badge)}>
                <Building2 className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", theme.dot)} aria-hidden />
                  <span className="text-lg font-semibold tracking-tight">{entity.code}</span>
                  {entity.isLocked && (
                    <Badge variant="outline" className="text-[10px]">Cerrado</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{entity.legalName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="hidden text-xs sm:inline">
                {expanded ? "Ocultar detalle" : "Ver detalle"}
              </span>
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <KpiChip
              icon={TrendingUp}
              label="Ingresos"
              value={formatMXN(entity.annualIncome)}
              tone="success"
            />
            <KpiChip
              icon={TrendingDown}
              label="Egresos"
              value={formatMXN(entity.annualExpense)}
              tone="danger"
            />
            <KpiChip
              icon={Wallet}
              label="Utilidad"
              value={formatMXN(entity.annualProfit)}
              tone={profitPositive ? "success" : "danger"}
              emphasize
            />
          </div>

          {entity.annualIncome > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Margen sobre ingresos</span>
                <span className="font-medium tabular-nums">
                  {formatPercent(marginPct / 100)}
                </span>
              </div>
              <Progress
                value={marginPct}
                className={cn(
                  "h-1.5",
                  profitPositive
                    ? (PROGRESS_INDICATOR_BY_CODE[entity.code] ?? PROGRESS_INDICATOR_DEFAULT)
                    : PROGRESS_INDICATOR_NEGATIVE,
                )}
              />
            </div>
          )}
        </CardHeader>
      </button>

      {expanded && (
        <CardContent className="space-y-5 border-t pt-5">
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowMonths((v) => !v)}
            >
              {showMonths ? "Ocultar meses" : "Ver meses"}
            </Button>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <BudgetLinesSection
              sectionLabel="Ingresos"
              tone="success"
              lines={entity.incomeLines}
              monthlyTotal={entity.monthlyIncome}
              annualTotal={entity.annualIncome}
              showMonths={showMonths}
              emptyText="Sin ingresos registrados en /ingresos."
            />

            <BudgetLinesSection
              sectionLabel="Egresos"
              tone="danger"
              lines={entity.expenseLines}
              monthlyTotal={entity.monthlyExpense}
              annualTotal={entity.annualExpense}
              showMonths={showMonths}
              emptyText="Sin egresos registrados en /egresos."
            />
          </div>

          <div
            className={cn(
              "flex items-center justify-between rounded-md border px-4 py-3",
              profitPositive
                ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                : "border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20",
            )}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Utilidad {entity.code}
              </p>
              <p className="text-xs text-muted-foreground">Ingresos − Egresos</p>
            </div>
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                profitPositive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
              )}
            >
              {formatMXN(entity.annualProfit)}
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function KpiChip({
  icon: Icon,
  label,
  value,
  tone,
  emphasize = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "success" | "danger";
  emphasize?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2.5 rounded-md border bg-card px-3 py-2",
      emphasize && (tone === "success"
        ? "border-emerald-200 dark:border-emerald-900/40"
        : "border-rose-200 dark:border-rose-900/40"),
    )}>
      <Icon
        className={cn(
          "size-4 shrink-0",
          tone === "success" ? "text-emerald-600" : "text-rose-600",
        )}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={cn(
          "truncate text-sm font-semibold tabular-nums",
          emphasize && (tone === "success" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"),
        )}>
          {value}
        </p>
      </div>
    </div>
  );
}

interface BudgetLinesSectionProps {
  sectionLabel: string;
  tone: "success" | "danger";
  lines: BudgetLineRow[];
  monthlyTotal: number[];
  annualTotal: number;
  showMonths: boolean;
  emptyText: string;
}

function BudgetLinesSection({
  sectionLabel,
  tone,
  lines,
  monthlyTotal,
  annualTotal,
  showMonths,
  emptyText,
}: BudgetLinesSectionProps) {
  return (
    <section className="space-y-2">
      <h3 className={cn(
        "text-[11px] font-semibold uppercase tracking-wider",
        tone === "success" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
      )}>
        {sectionLabel}
      </h3>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Concepto</th>
              {showMonths &&
                MONTH_SHORT.map((m) => (
                  <th key={m} className="px-2 py-2 text-right font-medium">{m}</th>
                ))}
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Anual</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-4 text-center text-xs text-muted-foreground"
                  colSpan={showMonths ? 14 : 2}
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              lines.map((line) => (
                <LineRow key={line.id} line={line} showMonths={showMonths} />
              ))
            )}
            {lines.length > 0 && (
              <tr className="border-t bg-muted/40 font-semibold">
                <td className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Total {sectionLabel.toLowerCase()}
                </td>
                {showMonths &&
                  monthlyTotal.map((v, i) => (
                    <td key={i} className="px-2 py-2 text-right text-xs tabular-nums">
                      {v !== 0 ? formatMXN(v) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                  ))}
                <td className="px-3 py-2 text-right tabular-nums">{formatMXN(annualTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LineRow({
  line,
  showMonths,
}: {
  line: BudgetLineRow;
  showMonths: boolean;
}) {
  const subLabel = line.propertyName ?? line.categoryName ?? conceptTypeLabel(line.conceptType);
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium leading-tight">{line.conceptLabel}</span>
          {subLabel && subLabel !== line.conceptLabel && (
            <span className="text-[10px] text-muted-foreground">{subLabel}</span>
          )}
        </div>
      </td>
      {showMonths &&
        MONTH_KEYS.map((k) => (
          <td key={k} className="px-2 py-2.5 text-right text-xs tabular-nums">
            {line.months[k] > 0 ? (
              formatMXN(line.months[k])
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </td>
        ))}
      <td className="px-3 py-2.5 text-right text-sm font-medium tabular-nums">
        {formatMXN(line.annual)}
      </td>
    </tr>
  );
}

function conceptTypeLabel(t: BudgetLineRow["conceptType"]): string {
  switch (t) {
    case "INCOME_RENT": return "Renta";
    case "INCOME_BILLBOARD": return "Espectacular";
    case "INCOME_GUARANTEE": return "Fianza";
    case "INCOME_OTHER": return "Otro ingreso";
    case "EXPENSE": return "Egreso operativo";
    case "TAX_STRATEGY": return "Estrategia fiscal";
    case "DEBT_SERVICE": return "Servicio de deuda";
    default: return "";
  }
}
