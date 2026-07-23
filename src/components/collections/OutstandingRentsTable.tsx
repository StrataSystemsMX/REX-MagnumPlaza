"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type Row,
  useReactTable,
} from "@tanstack/react-table";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FileDown,
  HandCoins,
  Plus,
  Search,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
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
import { SendNotificationDialog } from "@/components/collections/SendNotificationDialog";
import { RentStatusBadge } from "@/components/shared/RentStatusBadge";
import { INMUEBLES_TAB_VALUE } from "@/components/shared/property-filter-constants";
import { Badge } from "@/components/ui/badge";
import { OUTSTANDING_STATUSES } from "@/lib/constants/rent-statuses";
import { rentStatusLabel } from "@/lib/i18n/enums";
import { unitWithProperty } from "@/lib/i18n/unit-label";
import type { OutstandingRent } from "@/lib/services/payments-queries";
import type { RentStatus } from "@/generated/prisma/enums";
import type { ReminderLevel } from "@/lib/pdf/template-config";
import { cn } from "@/lib/utils";
import { formatMXN } from "@/lib/format-currency";
import { formatPeriodLong } from "@/lib/format-date";

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
  /** Escalón activo desde la URL. Default `all`. */
  escalon?: EscalonChip;
  /** Filtro de plaza/inmueble desde el PropertyFilterTabs a nivel de página. */
  activePlazaId: string | null;
}

export function OutstandingRentsTable({
  rents,
  escalon = "all",
  activePlazaId,
}: OutstandingRentsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [paymentContext, setPaymentContext] = useState<RegisterPaymentDialogContext | null>(
    null,
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleGroup(unitId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const escalonStatus = activeEscalonChip.status;
    return rents.filter((r) => {
      if (escalonStatus && r.status !== escalonStatus) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (activePlazaId === INMUEBLES_TAB_VALUE) {
        if (r.contract.unit.property.type === "PLAZA_COMERCIAL") return false;
      } else if (activePlazaId) {
        if (r.contract.unit.property.id !== activePlazaId) return false;
      }
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
  }, [rents, statusFilter, activePlazaId, search, activeEscalonChip]);

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
          <div className="min-w-0">
            <Link
              href={`/lessees/${row.original.contract.lessee.id}`}
              className="truncate font-medium hover:underline"
            >
              {row.original.contract.lessee.legalName}
            </Link>
            {row.original.contract.lessee.contactName ? (
              <p className="truncate text-[10px] text-muted-foreground">
                {row.original.contract.lessee.contactName}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "period",
        header: "Periodo",
        cell: ({ row }) => (
          <div className="text-center text-xs tabular-nums text-muted-foreground">
            {formatPeriodLong(row.original.period)}
          </div>
        ),
      },
      {
        accessorKey: "amountDue",
        header: "Cargo",
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatMXN(row.original.amountDue, 2)}
          </div>
        ),
      },
      {
        accessorKey: "amountPaid",
        header: "Pagado",
        cell: ({ row }) => (
          <div className="text-right tabular-nums text-muted-foreground">
            {formatMXN(row.original.amountPaid, 2)}
          </div>
        ),
      },
      {
        id: "balance",
        header: "Saldo",
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">
            {formatMXN(row.original.balance, 2)}
          </div>
        ),
      },
      {
        accessorKey: "daysOverdue",
        header: "Vencido",
        cell: ({ row }) => {
          const d = row.original.daysOverdue;
          if (d <= 0) {
            return (
              <div className="text-center text-xs text-muted-foreground">—</div>
            );
          }
          const tone =
            d >= 60
              ? "bg-rose-50 text-rose-700 ring-rose-200"
              : d >= 30
                ? "bg-amber-50 text-amber-700 ring-amber-200"
                : "bg-muted text-muted-foreground ring-foreground/10";
          return (
            <div className="text-center">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1",
                  tone,
                )}
              >
                {d}d
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Estado",
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
                <SendNotificationDialog
                  rentId={row.original.id}
                  level={reminderLevel}
                  lessee={{
                    legalName: row.original.contract.lessee.legalName,
                    whatsapp: row.original.contract.lessee.whatsapp ?? null,
                    email: row.original.contract.lessee.email ?? null,
                    preferredChannel: row.original.contract.lessee.preferredChannel,
                  }}
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
                  unitLabel: unitWithProperty(row.original.contract.unit, " "),
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

  const tableRows = table.getRowModel().rows;
  const groupedRows = useMemo(() => {
    const map = new Map<
      string,
      {
        unit: OutstandingRent["contract"]["unit"];
        rows: Row<OutstandingRent>[];
      }
    >();
    for (const row of tableRows) {
      const unit = row.original.contract.unit;
      const existing = map.get(unit.id);
      if (existing) {
        existing.rows.push(row);
      } else {
        map.set(unit.id, { unit, rows: [row] });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const p = a.unit.property.name.localeCompare(b.unit.property.name);
      return p !== 0 ? p : a.unit.code.localeCompare(b.unit.code);
    });
  }, [tableRows]);

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
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar inquilino o unidad..."
              className="pl-8"
            />
          </div>
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
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="text-left sm:text-right">
            <p className="text-xs text-muted-foreground">Saldo filtrado</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMXN(totalBalance, 2)}
            </p>
          </div>
          <Button onClick={() => setBulkOpen(true)}>
            <Plus className="size-4" />
            Pago bulk
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[720px] caption-bottom text-sm">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const align =
                    h.column.id === "lessee"
                      ? ""
                      : h.column.id === "actions"
                        ? "text-right"
                        : h.column.id === "amountDue" ||
                            h.column.id === "amountPaid" ||
                            h.column.id === "balance"
                          ? "text-right"
                          : "text-center";
                  return (
                    <TableHead
                      key={h.id}
                      className={cn(
                        "bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-xs font-medium uppercase tracking-wide text-muted-foreground",
                        align,
                      )}
                    >
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {groupedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Sin rentas pendientes para los filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              groupedRows.map((group) => {
                const isCollapsed = collapsed.has(group.unit.id);
                const isPlaza = group.unit.property.type === "PLAZA_COMERCIAL";
                const Icon = isPlaza ? Store : Building2;
                const Chevron = isCollapsed ? ChevronRight : ChevronDown;
                return (
                  <Fragment key={group.unit.id}>
                    <TableRow
                      className="cursor-pointer bg-muted/40 hover:bg-muted/60"
                      onClick={() => toggleGroup(group.unit.id)}
                    >
                      <TableCell colSpan={columns.length} className="py-2">
                        <div className="flex items-center gap-2">
                          <Chevron className="size-4 text-muted-foreground" />
                          <Icon className="size-4 text-muted-foreground" />
                          <span className="font-medium">
                            {group.unit.property.name}
                          </span>
                          {isPlaza ? (
                            <span className="text-xs text-muted-foreground">
                              {group.unit.code}
                              {group.unit.name ? ` — ${group.unit.name}` : ""}
                            </span>
                          ) : null}
                          <Badge variant="outline" className="text-[10px]">
                            {isPlaza ? "Plaza" : "Inmueble"}
                          </Badge>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {group.rows.length}{" "}
                            {group.rows.length === 1 ? "renta" : "rentas"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {!isCollapsed &&
                      group.rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="py-3">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </table>
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
