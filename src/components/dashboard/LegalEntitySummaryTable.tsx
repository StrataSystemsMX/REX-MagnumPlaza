"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatMXN, formatPercent } from "@/lib/format-currency";

export interface LegalEntitySummaryRow {
  id: string;
  code: string;
  income: number;
  expenses: number;
  profit: number;
  rent: number;
}

interface Props {
  rows: ReadonlyArray<LegalEntitySummaryRow>;
}

export function LegalEntitySummaryTable({ rows }: Props) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Entidad</th>
            <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Ingresos</th>
            <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Egresos</th>
            <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Utilidad</th>
            <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Rentabilidad</th>
            <th className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((le) => {
            const go = () => router.push(`/legal-entity/${le.id}`);
            return (
              <tr
                key={le.code}
                role="link"
                tabIndex={0}
                onClick={go}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go();
                  }
                }}
                className="group cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"
              >
                <td className="py-2.5 font-semibold">{le.code}</td>
                <td className="py-2.5 text-right tabular-nums">{formatMXN(le.income)}</td>
                <td className="py-2.5 text-right tabular-nums text-muted-foreground">{formatMXN(le.expenses)}</td>
                <td className={`py-2.5 text-right tabular-nums font-medium ${le.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatMXN(le.profit)}
                </td>
                <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                  {le.income > 0 ? formatPercent(le.rent) : "—"}
                </td>
                <td className="py-2.5 pl-2 text-right">
                  <ChevronRight className="ml-auto size-4 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                Sin movimientos en el período
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
