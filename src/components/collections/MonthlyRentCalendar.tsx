"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  RegisterPaymentDialog,
  type RegisterPaymentDialogContext,
} from "@/components/collections/RegisterPaymentDialog";
import {
  RentStatusBadge,
  rentStatusClasses,
} from "@/components/shared/RentStatusBadge";
import type { RentStatus } from "@/generated/prisma/enums";
import { capitalizeFirst } from "@/lib/utils";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const MONTH = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Forma mínima necesaria del Rent para el calendario. Se diseña laxo para
 * que sirva tanto con OutstandingRent (sólo pendientes) como con un listado
 * más amplio si en el futuro queremos incluir PAID en otra vista.
 */
export interface RentCalendarItem {
  id: string;
  period: Date;
  amountDue: string | number;
  amountPaid: string | number;
  status: RentStatus;
  contract: {
    lessee: { legalName: string };
    unit: {
      code: string;
      property: { name: string };
    };
  };
}

interface MonthlyRentCalendarProps {
  /** Todos los rents (de cualquier mes) — se agrupan por periodo. */
  rents: ReadonlyArray<RentCalendarItem>;
}

export function MonthlyRentCalendar({ rents }: MonthlyRentCalendarProps) {
  const [paymentContext, setPaymentContext] = useState<RegisterPaymentDialogContext | null>(
    null,
  );

  // Agrupa por YYYY-MM (UTC).
  const byMonth = useMemo(() => {
    const map = new Map<string, RentCalendarItem[]>();
    for (const r of rents) {
      const key = `${r.period.getUTCFullYear()}-${String(r.period.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rents]);

  const months = useMemo(() => {
    return Array.from(byMonth.keys()).sort();
  }, [byMonth]);

  // Mes seleccionado: por default el más cercano al actual.
  const [activeMonth, setActiveMonth] = useState<string>(() => {
    if (months.length === 0) return "";
    const now = new Date();
    const target = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    return months.includes(target) ? target : months[0]!;
  });

  if (months.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No hay rentas registradas.
      </div>
    );
  }

  const idx = months.indexOf(activeMonth);
  const monthRents = byMonth.get(activeMonth) ?? [];
  const periodDate = monthRents[0]?.period ?? new Date();

  // Resumen del mes
  const total = monthRents.reduce((acc, r) => acc + Number(r.amountDue), 0);
  const collected = monthRents.reduce((acc, r) => acc + Number(r.amountPaid), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => idx > 0 && setActiveMonth(months[idx - 1]!)}
            disabled={idx <= 0}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="text-lg font-semibold">
            {capitalizeFirst(MONTH.format(periodDate))}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => idx < months.length - 1 && setActiveMonth(months[idx + 1]!)}
            disabled={idx >= months.length - 1}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total cargado</p>
            <p className="font-semibold tabular-nums">{MXN.format(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Cobrado</p>
            <p className="font-semibold tabular-nums">{MXN.format(collected)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Por cobrar</p>
            <p className="font-semibold tabular-nums text-destructive">
              {MXN.format(total - collected)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {monthRents.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() =>
              setPaymentContext({
                rentId: r.id,
                amountDue: String(r.amountDue),
                amountPaid: String(r.amountPaid),
                period: r.period,
                lesseeName: r.contract.lessee.legalName,
                unitLabel: `${r.contract.unit.property.name} ${r.contract.unit.code}`,
              })
            }
            className={`rounded-md border p-3 text-left text-sm transition-shadow hover:shadow-md ${rentStatusClasses(r.status)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.contract.lessee.legalName}</p>
                <p className="truncate text-xs opacity-75">
                  {r.contract.unit.property.name} {r.contract.unit.code}
                </p>
              </div>
              <RentStatusBadge status={r.status} className="shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-semibold tabular-nums">
                {MXN.format(Number(r.amountDue))}
              </span>
              {Number(r.amountPaid) > 0 && r.status !== "PAID" ? (
                <span className="text-xs tabular-nums opacity-75">
                  Pagado {MXN.format(Number(r.amountPaid))}
                </span>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      <RegisterPaymentDialog
        context={paymentContext}
        open={paymentContext !== null}
        onOpenChange={(o) => !o && setPaymentContext(null)}
      />
    </div>
  );
}
