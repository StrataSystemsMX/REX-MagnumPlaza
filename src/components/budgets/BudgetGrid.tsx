"use client";

import React, { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BudgetLineDialog } from "./BudgetLineDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionDeleteBudgetLine } from "@/lib/services/budgets";
import { MONTH_KEYS, type BudgetData, type BudgetLineRow } from "@/lib/services/budgets-types";
import type { BudgetConceptType } from "@/generated/prisma/enums";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const SECTION_LABELS: Partial<Record<BudgetConceptType, string>> = {
  INCOME_RENT: "Ingresos por Renta",
  INCOME_BILLBOARD: "Ingresos por Renta",
  INCOME_GUARANTEE: "Ingresos por Renta",
  INCOME_OTHER: "Ingresos por Renta",
  EXPENSE: "Egresos Operativos",
  TAX_STRATEGY: "Estrategia Fiscal",
  DEBT_SERVICE: "Servicio de Deuda",
};

const SECTION_ORDER: BudgetConceptType[] = [
  "INCOME_RENT",
  "INCOME_BILLBOARD",
  "INCOME_GUARANTEE",
  "INCOME_OTHER",
  "EXPENSE",
  "TAX_STRATEGY",
  "DEBT_SERVICE",
];

function groupLines(lines: BudgetLineRow[]) {
  const sections = new Map<string, BudgetLineRow[]>();
  for (const line of lines) {
    const section = SECTION_LABELS[line.conceptType] ?? "Otros";
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(line);
  }
  // Devuelve en orden definido
  const ordered: [string, BudgetLineRow[]][] = [];
  const seen = new Set<string>();
  for (const type of SECTION_ORDER) {
    const label = SECTION_LABELS[type];
    if (label && !seen.has(label)) {
      const rows = sections.get(label);
      if (rows && rows.length > 0) {
        ordered.push([label, rows]);
        seen.add(label);
      }
    }
  }
  return ordered;
}

interface Props {
  budget: BudgetData;
  canManage: boolean;
}

export function BudgetGrid({ budget, canManage }: Props) {
  const [isPending, startTransition] = useTransition();
  const sections = groupLines(budget.lines);

  const monthTotals = MONTH_KEYS.map((k) =>
    budget.lines.reduce((acc, l) => acc + l.months[k], 0),
  );
  const grandTotal = monthTotals.reduce((a, b) => a + b, 0);

  function deleteLine(lineId: string) {
    startTransition(async () => {
      try {
        await actionDeleteBudgetLine(lineId, budget.budgetId);
        toast.success("Línea eliminada.");
      } catch {
        toast.error("Error al eliminar la línea.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">
          Presupuesto {budget.year}
          {budget.isLocked && (
            <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-600">
              Cerrado
            </span>
          )}
        </CardTitle>
        {canManage && !budget.isLocked && (
          <BudgetLineDialog budgetId={budget.budgetId} />
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Concepto</TableHead>
                {MONTH_SHORT.map((m) => (
                  <TableHead key={m} className="text-right text-xs">
                    {m}
                  </TableHead>
                ))}
                <TableHead className="text-right font-semibold">Total</TableHead>
                {canManage && !budget.isLocked && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody className={isPending ? "opacity-60" : ""}>
              {sections.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={15}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Sin líneas. Agrega la primera con el botón de arriba.
                  </TableCell>
                </TableRow>
              ) : (
                sections.map(([sectionLabel, lines]) => (
                  <React.Fragment key={sectionLabel}>
                    <TableRow className="bg-muted/50">
                      <TableCell
                        colSpan={canManage && !budget.isLocked ? 15 : 14}
                        className="py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {sectionLabel}
                      </TableCell>
                    </TableRow>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.conceptLabel}</TableCell>
                        {MONTH_KEYS.map((k) => (
                          <TableCell key={k} className="text-right tabular-nums text-sm">
                            {line.months[k] > 0
                              ? MXN.format(line.months[k])
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums font-semibold">
                          {MXN.format(line.annual)}
                        </TableCell>
                        {canManage && !budget.isLocked && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <BudgetLineDialog
                                budgetId={budget.budgetId}
                                line={line}
                                trigger={
                                  <Button variant="ghost" size="icon" className="size-7">
                                    <Pencil className="size-3.5" />
                                  </Button>
                                }
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteLine(line.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))
              )}
              {budget.lines.length > 0 && (
                <TableRow className="border-t-2 font-bold">
                  <TableCell>Total presupuestado</TableCell>
                  {monthTotals.map((t, i) => (
                    <TableCell key={i} className="text-right tabular-nums text-sm">
                      {MXN.format(t)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{MXN.format(grandTotal)}</TableCell>
                  {canManage && !budget.isLocked && <TableCell />}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
