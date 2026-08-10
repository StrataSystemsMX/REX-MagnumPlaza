"use client";

import { Badge } from "@/components/ui/badge";
import { rentStatusLabel, rentStatusVariant } from "@/shared/i18n/enums";
import type { ContractRent } from "@/server/services/contracts-queries";
import { capitalizeFirst } from "@/shared/utils";
import { formatMXN } from "@/shared/format-currency";
import { formatMonthShort } from "@/shared/format-date";

function bgFor(status: ContractRent["status"]): string {
  switch (status) {
    case "PAID":
      return "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950";
    case "WAIVED":
      return "border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950";
    case "PARTIAL":
      return "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950";
    case "DUE":
    case "OVERDUE_1M":
      return "border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950";
    case "OVERDUE_2M":
    case "OVERDUE_3M":
      return "border-red-400 bg-red-50 dark:border-red-900 dark:bg-red-950";
    case "PENDING":
    default:
      return "border-muted bg-card";
  }
}

interface RentCalendarProps {
  rents: ReadonlyArray<ContractRent>;
}

/**
 * Vista calendario inspirada en cómo el cliente lo ve en su Excel actual:
 * cada celda = un mes con su monto, estado y monto pagado.
 */
export function RentCalendar({ rents }: RentCalendarProps) {
  // Agrupar por año
  const byYear = rents.reduce<Record<number, ContractRent[]>>((acc, r) => {
    const y = r.period.getUTCFullYear();
    if (!acc[y]) acc[y] = [];
    acc[y].push(r);
    return acc;
  }, {});

  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b);

  if (years.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aún no hay rentas generadas. Activa el contrato (estado DRAFT → ACTIVE) para
        generarlas automáticamente.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Legend />
      {years.map((year) => (
        <div key={year} className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{year}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {byYear[year]!.map((r) => (
              <div
                key={r.id}
                className={`rounded-md border p-2 text-xs ${bgFor(r.status)}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {formatMonthShort(r.period)}
                  </span>
                  <Badge
                    variant={rentStatusVariant(r.status)}
                    className="px-1 py-0 text-[10px]"
                  >
                    {rentStatusLabel(r.status)}
                  </Badge>
                </div>
                <p className="mt-1 tabular-nums text-foreground">
                  {formatMXN(r.amountDue)}
                </p>
                {Number(r.amountPaid) > 0 && r.status !== "PAID" ? (
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    Pagado: {formatMXN(r.amountPaid)}
                  </p>
                ) : null}
                <p className="text-[10px] text-muted-foreground">
                  Vence{" "}
                  {capitalizeFirst(
                    r.dueDate.toLocaleDateString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    }),
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Legend() {
  const items: Array<{ status: ContractRent["status"]; label: string }> = [
    { status: "PAID", label: "Pagado" },
    { status: "PARTIAL", label: "Parcial" },
    { status: "PENDING", label: "Pendiente" },
    { status: "DUE", label: "Vencido" },
    { status: "OVERDUE_2M", label: "Vencido 2-3M" },
    { status: "WAIVED", label: "Condonado" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {items.map((i) => (
        <div key={i.status} className="flex items-center gap-1.5">
          <span
            className={`inline-block size-3 rounded border ${bgFor(i.status)}`}
            aria-hidden
          />
          {i.label}
        </div>
      ))}
    </div>
  );
}
