"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";
import { FileDown, HandCoins, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { SendWhatsAppButton } from "@/components/collections/SendWhatsAppButton";
import { RentStatusBadge } from "@/components/shared/RentStatusBadge";
import { OUTSTANDING_STATUSES } from "@/lib/constants/rent-statuses";
import { rentStatusLabel } from "@/lib/i18n/enums";
import type { OutstandingRent } from "@/lib/services/payments-queries";
import type { RentStatus } from "@/generated/prisma/enums";
import type { ReminderLevel } from "@/lib/pdf/template-config";
import { capitalizeFirst, cn } from "@/lib/utils";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const PERIOD = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

type StatusFilter = RentStatus | "ALL";

const statusFilterItems: Record<string, string> = {
  ALL: "Todos los estados",
  ...Object.fromEntries(OUTSTANDING_STATUSES.map((s) => [s, rentStatusLabel(s)])),
};

const ESCALON_CHIPS = [
  { key: "all", label: "Todas", status: null },
  { key: "1m", label: "1 mes", status: "OVERDUE_1M" as RentStatus, level: "1M" as ReminderLevel },
  { key: "2m", label: "2 meses", status: "OVERDUE_2M" as RentStatus, level: "2M" as ReminderLevel },
  { key: "3m", label: "3+ meses", status: "OVERDUE_3M" as RentStatus, level: "3M" as ReminderLevel, destructive: true },
] as const;

export type EscalonChip = (typeof ESCALON_CHIPS)[number]["key"];

interface OutstandingRentsTableProps {
  rents: ReadonlyArray<OutstandingRent>;
  properties: ReadonlyArray<{ id: string; name: string }>;
  /** Escalón activo desde la URL. Default `all`. */
  escalon?: EscalonChip;
}

export function OutstandingRentsTable({
  rents,
  properties,
  escalon = "all",
}: OutstandingRentsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [propertyFilter, setPropertyFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [paymentContext, setPaymentContext] = useState<RegisterPaymentDialogContext | null>(
    null,
  );
  const [bulkOpen, setBulkOpen] = useState(false);

  const activeEscalonChip = ESCALON_CHIPS.find((c) => c.key === escalon) ?? ESCALON_CHIPS[0];
  const reminderLevel = "level" in activeEscalonChip ? activeEscalonChip.level : null;

  function setEscalon(next: EscalonChip) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("escalon");
    else params.set("escalon", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const escalonCounts = useMemo(() => {
    const counts = { all: rents.length, "1m": 0, "2m": 0, "3m": 0 };
    for (const r of rents) {
      if (r.status === "OVERDUE_1M") counts["1m"]++;
      else if (r.status === "OVERDUE_2M") counts["2m"]++;
      else if (r.status === "OVERDUE_3M") counts["3m"]++;
    }
    return counts;
  }, [rents]);

  const propertyFilterItems = useMemo<Record<string, string>>(
    () => ({
      ALL: "Todos los inmuebles",
      ...Object.fromEntries(properties.map((p) => [p.id, p.name])),
    }),
    [properties],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const escalonStatus = activeEscalonChip.status;
    return rents.filter((r) => {
      if (escalonStatus && r.status !== escalonStatus) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (propertyFilter !== "ALL" && r.contract.unit.property.id !== propertyFilter)
        return false;
      if (q) {
        const haystack =
          r.contract.lessee.legalName.toLowerCase() +
          " " +
          (r.contract.lessee.contactName?.toLowerCase() ?? "") +
          " " +
          r.contract.unit.property.name.toLowerCase() +
          " " +
          r.contract.unit.code.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rents, statusFilter, propertyFilter, search, activeEscalonChip]);

  const totalBalance = useMemo(
    () => filtered.reduce((acc, r) => acc + Number(r.balance), 0),
    [filtered],
  );

  const columns = useMemo<ColumnDef<OutstandingRent>[]>(
    () => [
      {
        id: "lessee",
        header: "Inquilino",
        cell: ({ row }) => (
          <div className="text-sm">
            <Link
              href={`/lessees/${row.original.contract.lessee.id}`}
              className="font-medium hover:underline"
            >
              {row.original.contract.lessee.legalName}
            </Link>
            {row.original.contract.lessee.contactName ? (
              <p className="text-xs text-muted-foreground">
                {row.original.contract.lessee.contactName}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "unit",
        header: "Unidad",
        cell: ({ row }) => (
          <div className="text-sm">
            <p>{row.original.contract.unit.property.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.contract.unit.code}
              {row.original.contract.unit.name
                ? ` — ${row.original.contract.unit.name}`
                : ""}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "period",
        header: () => <div className="text-center">Periodo</div>,
        cell: ({ row }) => (
          <div className="text-center text-sm">{capitalizeFirst(PERIOD.format(row.original.period))}</div>
        ),
      },
      {
        accessorKey: "amountDue",
        header: () => <span className="text-right">Cargo</span>,
        cell: ({ row }) => (
          <span className="text-right tabular-nums">
            {MXN.format(Number(row.original.amountDue))}
          </span>
        ),
      },
      {
        accessorKey: "amountPaid",
        header: () => <span className="text-right">Pagado</span>,
        cell: ({ row }) => (
          <span className="text-right tabular-nums text-muted-foreground">
            {MXN.format(Number(row.original.amountPaid))}
          </span>
        ),
      },
      {
        id: "balance",
        header: () => <span className="text-right">Saldo</span>,
        cell: ({ row }) => (
          <span className="text-right tabular-nums font-medium">
            {MXN.format(Number(row.original.balance))}
          </span>
        ),
      },
      {
        accessorKey: "daysOverdue",
        header: "Vencido",
        cell: ({ row }) => {
          const d = row.original.daysOverdue;
          if (d <= 0) return <span className="text-xs text-muted-foreground">—</span>;
          const cls =
            d >= 60
              ? "text-destructive font-medium"
              : d >= 30
                ? "text-orange-600 dark:text-orange-400 font-medium"
                : "text-foreground";
          return <span className={`text-xs ${cls}`}>{d}d</span>;
        },
      },
      {
        accessorKey: "status",
        header: () => <div className="text-center">Estado</div>,
        cell: ({ row }) => (
          <div className="text-center">
            <RentStatusBadge status={row.original.status} />
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            {reminderLevel ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const url = `/api/documents/overdue-reminder?rentId=${encodeURIComponent(row.original.id)}&level=${reminderLevel}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  title="Ver PDF del aviso"
                >
                  <FileDown className="size-4" />
                  PDF
                </Button>
                <SendWhatsAppButton
                  rentId={row.original.id}
                  level={reminderLevel}
                  lesseeName={row.original.contract.lessee.legalName}
                  hasWhatsapp={Boolean(row.original.contract.lessee.whatsapp)}
                />
              </>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setPaymentContext({
                  rentId: row.original.id,
                  amountDue: row.original.amountDue.toString(),
                  amountPaid: row.original.amountPaid.toString(),
                  period: row.original.period,
                  lesseeName: row.original.contract.lessee.legalName,
                  unitLabel: `${row.original.contract.unit.property.name} ${row.original.contract.unit.code}`,
                })
              }
            >
              <HandCoins className="size-4" />
              Registrar pago
            </Button>
          </div>
        ),
      },
    ],
    [reminderLevel],
  );

  const table = useReactTable({
    data: filtered as OutstandingRent[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {ESCALON_CHIPS.map((chip) => {
          const isActive = chip.key === activeEscalonChip.key;
          const count = escalonCounts[chip.key];
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setEscalon(chip.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                isActive
                  ? "destructive" in chip
                    ? "border-destructive bg-destructive text-destructive-foreground"
                    : "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {chip.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  isActive
                    ? "bg-background/20"
                    : "bg-muted text-foreground/70",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-xs"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
            items={statusFilterItems}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusFilterItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={propertyFilter}
            onValueChange={(v) => v && setPropertyFilter(v)}
            items={propertyFilterItems}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(propertyFilterItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="text-left sm:text-right">
            <p className="text-xs text-muted-foreground">Saldo filtrado</p>
            <p className="text-lg font-semibold tabular-nums">
              {MXN.format(totalBalance)}
            </p>
          </div>
          <Button onClick={() => setBulkOpen(true)}>
            <Plus className="size-4" />
            Pago bulk
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table className="min-w-[820px]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-sm text-muted-foreground"
                >
                  Sin rentas pendientes para los filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
