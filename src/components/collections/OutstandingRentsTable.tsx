"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";
import { HandCoins, Plus } from "lucide-react";
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
import { RentStatusBadge } from "@/components/shared/RentStatusBadge";
import type { OutstandingRent } from "@/lib/services/payments-queries";
import type { RentStatus } from "@/generated/prisma/enums";

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

const STATUS_OPTIONS: ReadonlyArray<RentStatus> = [
  "DUE",
  "PARTIAL",
  "OVERDUE_1M",
  "OVERDUE_2M",
  "OVERDUE_3M",
];

const statusFilterItems: Record<string, string> = {
  ALL: "Todos los estados",
  ...Object.fromEntries(STATUS_OPTIONS.map((s) => [s, s])),
};

interface OutstandingRentsTableProps {
  rents: ReadonlyArray<OutstandingRent>;
  properties: ReadonlyArray<{ id: string; name: string }>;
}

export function OutstandingRentsTable({ rents, properties }: OutstandingRentsTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [propertyFilter, setPropertyFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [paymentContext, setPaymentContext] = useState<RegisterPaymentDialogContext | null>(
    null,
  );
  const [bulkOpen, setBulkOpen] = useState(false);

  const propertyFilterItems = useMemo<Record<string, string>>(
    () => ({
      ALL: "Todos los inmuebles",
      ...Object.fromEntries(properties.map((p) => [p.id, p.name])),
    }),
    [properties],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rents.filter((r) => {
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
  }, [rents, statusFilter, propertyFilter, search]);

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
            <p className="font-medium">{row.original.contract.lessee.legalName}</p>
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
        header: "Periodo",
        cell: ({ row }) => (
          <span className="text-sm capitalize">{PERIOD.format(row.original.period)}</span>
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
        header: "Estado",
        cell: ({ row }) => <RentStatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <div className="text-right">
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
    [],
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar inquilino, plaza, unidad..."
            className="max-w-xs"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
            items={statusFilterItems}
          >
            <SelectTrigger className="w-44">
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
            <SelectTrigger className="w-56">
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
        <div className="flex items-center gap-3">
          <div className="text-right">
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

      <div className="rounded-md border bg-card">
        <Table>
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
