"use client";

import { ArrowUpRight, CreditCard, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkPaymentDialog } from "@/components/collections/BulkPaymentDialog";
import {
  RegisterPaymentDialog,
  type RegisterPaymentDialogContext,
} from "@/components/collections/RegisterPaymentDialog";
import { capitalizeFirst, cn } from "@/lib/utils";
import type {
  MonthlyCollections,
  MonthlyPropertyGroup,
  MonthlyUnitRow,
  MonthlyUnitStatus,
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

const MONTH = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

interface MonthlyCollectionsViewProps {
  data: MonthlyCollections;
}

export function MonthlyCollectionsView({ data }: MonthlyCollectionsViewProps) {
  const [propertyFilter, setPropertyFilter] = useState<string>("ALL");
  const [paymentContext, setPaymentContext] =
    useState<RegisterPaymentDialogContext | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const propertyItems = useMemo<Record<string, string>>(
    () => ({
      ALL: "Todas las plazas",
      ...Object.fromEntries(data.properties.map((p) => [p.propertyId, p.propertyName])),
    }),
    [data.properties],
  );

  const visibleGroups = useMemo(() => {
    if (propertyFilter === "ALL") return data.properties;
    return data.properties.filter((p) => p.propertyId === propertyFilter);
  }, [data.properties, propertyFilter]);

  const period = data.period;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Cobros del Mes</h2>
          <p className="text-sm text-muted-foreground">
            {capitalizeFirst(MONTH.format(period))} ·{" "}
            {propertyFilter === "ALL"
              ? "Todas las plazas"
              : (propertyItems[propertyFilter] ?? "")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
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
            Registrar pago
          </Button>
        </div>
      </div>

      <StatsRow totals={data.totals} />

      <div className="space-y-4">
        {visibleGroups.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sin inmuebles para los filtros aplicados.
          </div>
        ) : (
          visibleGroups.map((g) => (
            <PropertyGroupCard
              key={g.propertyId}
              group={g}
              period={period}
              onRegisterPayment={setPaymentContext}
            />
          ))
        )}
      </div>

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
// Stats row
// ----------------------------------------------------------------------------

function StatsRow({ totals }: { totals: MonthlyCollections["totals"] }) {
  const cards: Array<{
    key: MonthlyUnitStatus | "ALL";
    label: string;
    value: number;
    className: string;
  }> = [
    {
      key: "PAID",
      label: "Pagados",
      value: totals.paid,
      className:
        "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
    },
    {
      key: "PARTIAL",
      label: "Parciales",
      value: totals.partial + totals.abono,
      className:
        "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
    },
    {
      key: "SIN_PAGO",
      label: "Sin pago",
      value: totals.sinPago,
      className:
        "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    },
    {
      key: "PRE_PAGADO",
      label: "Pre-pagado",
      value: totals.prePagado,
      className:
        "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
    },
    {
      key: "VACANT",
      label: "Vacíos",
      value: totals.vacant,
      className:
        "border-border bg-muted/30 text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.key}
          className={cn(
            "rounded-lg border px-4 py-3 text-center tabular-nums",
            c.className,
          )}
        >
          <div className="text-2xl font-semibold">{c.value}</div>
          <div className="text-xs">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Property group card
// ----------------------------------------------------------------------------

interface PropertyGroupCardProps {
  group: MonthlyPropertyGroup;
  period: Date;
  onRegisterPayment: (ctx: RegisterPaymentDialogContext) => void;
}

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

function PropertyGroupCard({ group, period, onRegisterPayment }: PropertyGroupCardProps) {
  const [showAllPaid, setShowAllPaid] = useState(false);

  // Cuando hay muchas filas pagadas, las colapsamos al final con un toggle.
  const COLLAPSE_THRESHOLD = 4;
  const paidCount = group.units.filter((u) => u.status === "PAID").length;
  const shouldCollapse = paidCount > COLLAPSE_THRESHOLD && !showAllPaid;

  const { displayed, hiddenPaidCount } = useMemo(() => {
    if (!shouldCollapse) {
      return { displayed: group.units, hiddenPaidCount: 0 };
    }
    // Mostramos los no-PAID + los primeros COLLAPSE_THRESHOLD PAID.
    const out: MonthlyUnitRow[] = [];
    let shown = 0;
    let hidden = 0;
    for (const u of group.units) {
      if (u.status === "PAID") {
        if (shown < COLLAPSE_THRESHOLD) {
          out.push(u);
          shown += 1;
        } else {
          hidden += 1;
        }
      } else {
        out.push(u);
      }
    }
    return { displayed: out, hiddenPaidCount: hidden };
  }, [group.units, shouldCollapse]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", dotColorFor(group.propertyId))} />
          <h3 className="font-semibold">{group.propertyName}</h3>
          <span className="text-xs text-muted-foreground">
            {group.managerEntityCode} · {group.unitCount} locales
          </span>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold tabular-nums">
            {MXN_INT.format(Number(group.expectedTotal))}
          </div>
          <div className="text-xs text-muted-foreground">esperado</div>
        </div>
      </div>

      <div className="overflow-x-auto">
      <Table className="min-w-[760px] table-fixed">
        <TableHeader>
          <TableRow className="bg-transparent hover:bg-transparent">
            <TableHead className="w-16">Local</TableHead>
            <TableHead className="w-auto">Inquilino</TableHead>
            <TableHead className="w-32 text-right">Renta Base</TableHead>
            <TableHead className="w-32 text-right">Cobrado</TableHead>
            <TableHead className="w-32 text-center">Estado</TableHead>
            <TableHead className="w-28">Escalón</TableHead>
            <TableHead className="w-24 text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayed.map((row) => (
            <UnitRow
              key={row.unitId}
              row={row}
              period={period}
              propertyName={group.propertyName}
              onRegisterPayment={onRegisterPayment}
            />
          ))}
          {hiddenPaidCount > 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="py-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllPaid(true)}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  + {hiddenPaidCount} locales más al corriente
                </button>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Unit row
// ----------------------------------------------------------------------------

interface UnitRowProps {
  row: MonthlyUnitRow;
  period: Date;
  propertyName: string;
  onRegisterPayment: (ctx: RegisterPaymentDialogContext) => void;
}

function UnitRow({ row, period, propertyName, onRegisterPayment }: UnitRowProps) {
  const rowClass = ROW_BG_BY_STATUS[row.status];
  const action = renderAction(row, period, propertyName, onRegisterPayment);

  return (
    <TableRow className={cn("border-b last:border-b-0", rowClass)}>
      <TableCell className="font-mono text-xs">{row.unitCode}</TableCell>
      <TableCell>
        {row.status === "VACANT" ? (
          <div className="text-sm">
            <span className="italic text-muted-foreground">Vacío</span>
            {row.lastLesseeName ? (
              <span className="ml-2 text-xs text-muted-foreground/80">
                {row.lastLesseeName}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="text-sm font-medium">{row.lesseeLegalName}</div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.status === "VACANT" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          MXN.format(Number(row.amountDue))
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <CobradoCell row={row} />
      </TableCell>
      <TableCell className="text-center">
        <StatusPill row={row} />
      </TableCell>
      <TableCell>
        {row.overdueLevel ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
            <span className="size-2 rounded-full bg-red-500" />
            Escalón {row.overdueLevel}
          </span>
        ) : row.status === "PAID" || row.status === "PRE_PAGADO" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />0
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">{action}</TableCell>
    </TableRow>
  );
}

const ROW_BG_BY_STATUS: Record<MonthlyUnitStatus, string> = {
  PAID: "",
  PARTIAL: "bg-amber-50/50 dark:bg-amber-950/20",
  SIN_PAGO: "bg-red-50/50 dark:bg-red-950/20",
  PRE_PAGADO: "bg-blue-50/40 dark:bg-blue-950/20",
  ABONO: "bg-sky-50/60 dark:bg-sky-950/20",
  WAIVED: "bg-blue-50/40 dark:bg-blue-950/20",
  VACANT: "bg-muted/30",
};

// ----------------------------------------------------------------------------
// Cobrado cell
// ----------------------------------------------------------------------------

function CobradoCell({ row }: { row: MonthlyUnitRow }) {
  if (row.status === "VACANT") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (row.status === "PRE_PAGADO") {
    return (
      <span className="font-semibold text-blue-700 dark:text-blue-300">Pre-pagado</span>
    );
  }
  if (row.status === "SIN_PAGO") {
    return (
      <span className="font-semibold text-red-700 dark:text-red-300">
        {MXN.format(0)}
      </span>
    );
  }
  if (row.status === "PAID") {
    return (
      <span className="font-semibold text-green-700 dark:text-green-300">
        {MXN.format(Number(row.amountPaid))}
      </span>
    );
  }
  if (row.status === "ABONO") {
    return (
      <span className="font-semibold text-sky-600 dark:text-sky-300">
        {MXN.format(Number(row.amountPaid))}
      </span>
    );
  }
  // PARTIAL
  return (
    <span className="font-semibold text-amber-700 dark:text-amber-300">
      {MXN.format(Number(row.amountPaid))}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Status pill
// ----------------------------------------------------------------------------

function StatusPill({ row }: { row: MonthlyUnitRow }) {
  switch (row.status) {
    case "PAID":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          ✓ Pagado
        </span>
      );
    case "PARTIAL":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Parcial
        </span>
      );
    case "ABONO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
          <ArrowUpRight className="size-3" />
          Abono
        </span>
      );
    case "SIN_PAGO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          × Sin pago
        </span>
      );
    case "PRE_PAGADO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          <CreditCard className="size-3" />
          {row.prePaidMonths && row.prePaidMonths > 0
            ? `${row.prePaidMonths} ${row.prePaidMonths === 1 ? "mes" : "meses"}`
            : "Pre-pagado"}
        </span>
      );
    case "VACANT":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Vacío
        </span>
      );
  }
}

// ----------------------------------------------------------------------------
// Action cell
// ----------------------------------------------------------------------------

function renderAction(
  row: MonthlyUnitRow,
  period: Date,
  propertyName: string,
  onRegisterPayment: (ctx: RegisterPaymentDialogContext) => void,
) {
  if (row.status === "VACANT") {
    return (
      <Link
        href={`/contracts/new?unitId=${encodeURIComponent(row.unitId)}`}
        className="text-sm text-primary hover:underline"
      >
        Rentar
      </Link>
    );
  }
  if (row.status === "ABONO") {
    return row.lesseeId ? (
      <Link
        href={`/lessees/${row.lesseeId}`}
        className="text-sm text-primary hover:underline"
      >
        Historial
      </Link>
    ) : null;
  }
  if (row.overdueLevel === 2 || row.overdueLevel === 3) {
    const escalon = row.overdueLevel === 3 ? "3m" : "2m";
    return (
      <Link
        href={`/collections?tab=por-cobrar&escalon=${escalon}`}
        className="text-sm font-medium text-red-700 hover:underline dark:text-red-300"
      >
        Carta formal
      </Link>
    );
  }
  if (row.status === "SIN_PAGO") {
    return (
      <Link
        href={`/collections?tab=por-cobrar&escalon=1m`}
        className="text-sm font-medium text-red-700 hover:underline dark:text-red-300"
      >
        Avisar
      </Link>
    );
  }

  // PAID, PARTIAL, PRE_PAGADO → "Ver" abre dialog para registrar pago si hay rent.
  if (row.rentId) {
    return (
      <button
        type="button"
        onClick={() =>
          onRegisterPayment({
            rentId: row.rentId!,
            amountDue: row.amountDue,
            amountPaid: row.amountPaid,
            period,
            lesseeName: row.lesseeLegalName ?? "",
            unitLabel: `${propertyName} ${row.unitCode}`,
          })
        }
        className="text-sm text-primary hover:underline"
      >
        Ver
      </button>
    );
  }
  return row.lesseeId ? (
    <Link
      href={`/lessees/${row.lesseeId}`}
      className="text-sm text-primary hover:underline"
    >
      Ver
    </Link>
  ) : null;
}
