"use client";

import React, { useState } from "react";
import {
  Banknote,
  ChevronDown,
  ChevronUp,
  Landmark,
  PiggyBank,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMXN } from "@/lib/format-currency";
import { MONTH_KEYS } from "@/lib/services/budgets-types";
import type { BudgetLineRow, ConsolidatedBudget } from "@/lib/services/budgets-types";

const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

interface Props {
  consolidated: ConsolidatedBudget;
}

export function BudgetClosingSection({ consolidated }: Props) {
  const { totals, entities, strategyLines, debtLines } = consolidated;
  const currentMonthIdx = new Date().getUTCMonth();
  const operatingThisMonth = totals.monthlyOperatingProfit[currentMonthIdx] ?? 0;
  const netPositive = totals.annualNetAfterDistribution >= 0;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Cierre del año</h2>
        <p className="text-xs text-muted-foreground">
          Consolidado de utilidades, estrategia fiscal y servicio de deuda.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OperatingProfitCard
          annual={totals.annualOperatingProfit}
          thisMonth={operatingThisMonth}
          entities={entities.map((e) => ({ code: e.code, profit: e.annualProfit }))}
        />

        <ClosingLinesCard
          icon={PiggyBank}
          tone="amber"
          label="Estrategia fiscal"
          helper="Nóminas marcadas como STRATEGY_NOMINA en /nominas."
          lines={strategyLines}
          monthlyTotal={totals.monthlyStrategy}
          annualTotal={totals.annualStrategy}
        />

        <ClosingLinesCard
          icon={Landmark}
          tone="violet"
          label="Inversiones / Deuda"
          helper="Hipotecas y préstamos activos desde /prestamos."
          lines={debtLines}
          monthlyTotal={totals.monthlyDebt}
          annualTotal={totals.annualDebt}
        />

        <NetProfitCard
          annual={totals.annualNetAfterDistribution}
          monthly={totals.monthlyNetAfterDistribution}
          positive={netPositive}
        />
      </div>
    </section>
  );
}

function OperatingProfitCard({
  annual,
  thisMonth,
  entities,
}: {
  annual: number;
  thisMonth: number;
  entities: Array<{ code: string; profit: number }>;
}) {
  const positive = annual >= 0;
  return (
    <Card className={cn(positive ? "ring-1 ring-emerald-500/15" : "ring-1 ring-rose-500/15")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Utilidad operativa
          </p>
          <p className="text-xs text-muted-foreground">Suma de utilidades por razón social.</p>
        </div>
        <Wallet className={cn("size-4", positive ? "text-emerald-600" : "text-rose-600")} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={cn(
          "text-3xl font-semibold tracking-tight tabular-nums",
          positive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
        )}>
          {formatMXN(annual)}
        </div>
        <p className="text-xs text-muted-foreground">
          Mes actual: <span className="font-medium tabular-nums">{formatMXN(thisMonth)}</span>
        </p>
        {entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {entities.map((e) => (
              <span
                key={e.code}
                className="rounded-full border bg-card px-2 py-0.5 text-[10px] tabular-nums"
              >
                <span className="font-semibold">{e.code}</span>{" "}
                <span className={cn(
                  e.profit >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400",
                )}>
                  {formatMXN(e.profit)}
                </span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ClosingTone = "amber" | "violet";

function ClosingLinesCard({
  icon: Icon,
  tone,
  label,
  helper,
  lines,
  monthlyTotal,
  annualTotal,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: ClosingTone;
  label: string;
  helper: string;
  lines: BudgetLineRow[];
  monthlyTotal: number[];
  annualTotal: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showMonths, setShowMonths] = useState(false);

  const accentText = tone === "amber"
    ? "text-amber-700 dark:text-amber-400"
    : "text-violet-700 dark:text-violet-400";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-4", accentText)} />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-xs text-muted-foreground">{helper}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <span className={cn("text-3xl font-semibold tracking-tight tabular-nums", accentText)}>
            {formatMXN(annualTotal)}
          </span>
          <span className="text-xs text-muted-foreground">
            {lines.length} {lines.length === 1 ? "línea" : "líneas"}
          </span>
        </div>

        {lines.length > 0 ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-between text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              <span>{expanded ? "Ocultar líneas" : "Ver líneas"}</span>
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>

            {expanded && (
              <div className="space-y-2">
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => setShowMonths((v) => !v)}
                  >
                    {showMonths ? "Ocultar meses" : "Ver meses"}
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-md border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-1.5 text-left font-medium">Concepto</th>
                        <th className="px-2 py-1.5 text-left font-medium">RFC</th>
                        {showMonths &&
                          MONTH_SHORT.map((m) => (
                            <th key={m} className="px-2 py-1.5 text-right font-medium">{m}</th>
                          ))}
                        <th className="px-3 py-1.5 text-right font-medium">Anual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <ClosingLineRow key={line.id} line={line} showMonths={showMonths} />
                      ))}
                      <tr className="border-t bg-muted/40 font-semibold">
                        <td className="px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                          Total
                        </td>
                        <td className="px-2 py-1.5" />
                        {showMonths &&
                          monthlyTotal.map((v, i) => (
                            <td key={i} className="px-2 py-1.5 text-right text-xs tabular-nums">
                              {v !== 0 ? formatMXN(v) : <span className="text-muted-foreground/50">—</span>}
                            </td>
                          ))}
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatMXN(annualTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Sin líneas registradas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ClosingLineRow({
  line,
  showMonths,
}: {
  line: BudgetLineRow;
  showMonths: boolean;
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-2 text-sm font-medium">{line.conceptLabel}</td>
      <td className="px-2 py-2">
        <span className="rounded-full border bg-card px-1.5 py-0.5 text-[10px] font-medium">
          {line.legalEntityCode}
        </span>
      </td>
      {showMonths &&
        MONTH_KEYS.map((k) => (
          <td key={k} className="px-2 py-2 text-right text-xs tabular-nums">
            {line.months[k] > 0 ? (
              formatMXN(line.months[k])
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </td>
        ))}
      <td className="px-3 py-2 text-right text-sm font-medium tabular-nums">
        {formatMXN(line.annual)}
      </td>
    </tr>
  );
}

function NetProfitCard({
  annual,
  monthly,
  positive,
}: {
  annual: number;
  monthly: number[];
  positive: boolean;
}) {
  const currentMonthIdx = new Date().getUTCMonth();
  const thisMonth = monthly[currentMonthIdx] ?? 0;

  return (
    <Card
      className={cn(
        "md:col-span-2",
        positive
          ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-card dark:border-emerald-900/60 dark:from-emerald-950/30 dark:to-card"
          : "border-rose-300 bg-gradient-to-br from-rose-50 to-card dark:border-rose-900/60 dark:from-rose-950/30 dark:to-card",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex size-8 items-center justify-center rounded-full",
            positive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
          )}>
            {positive ? <Sparkles className="size-4" /> : <Banknote className="size-4" />}
          </div>
          <div>
            <p className={cn(
              "text-[11px] font-semibold uppercase tracking-wider",
              positive ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300",
            )}>
              Utilidad neta del año
            </p>
            <p className="text-xs text-muted-foreground">
              Operativa − Estrategia − Inversiones/Deuda
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className={cn(
          "text-4xl font-bold tracking-tight tabular-nums",
          positive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
        )}>
          {formatMXN(annual)}
        </div>
        <p className="text-xs text-muted-foreground">
          Mes actual: <span className="font-medium tabular-nums">{formatMXN(thisMonth)}</span>
        </p>
      </CardContent>
    </Card>
  );
}
