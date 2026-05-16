"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";
import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { ContractWizard } from "@/components/contracts/ContractWizard";
import {
  contractStatusLabel,
  contractStatusVariant,
  contractTypeLabel,
} from "@/lib/i18n/enums";
import type {
  AvailableUnit,
  ContractListItem,
} from "@/lib/services/contracts-queries";
import type { ContractStatus } from "@/generated/prisma/enums";
import { capitalizeFirst, cn } from "@/lib/utils";

type StatusFilter = ContractStatus | "ALL";
type ExpiryFilter = "ALL" | "30" | "60" | "90";

const STATUSES: ReadonlyArray<ContractStatus> = [
  "DRAFT",
  "ACTIVE",
  "PENDING_RENEWAL",
  "EXPIRED",
  "TERMINATED",
  "CANCELLED",
];

const statusFilterItems: Record<string, string> = {
  ALL: "Todos los estados",
  ...Object.fromEntries(STATUSES.map((s) => [s, contractStatusLabel(s)])),
};

const expiryFilterItems: Record<string, string> = {
  ALL: "Todos los vencimientos",
  "30": "Vence en ≤ 30 días",
  "60": "Vence en ≤ 60 días",
  "90": "Vence en ≤ 90 días",
};

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

interface ContractTableProps {
  contracts: ReadonlyArray<ContractListItem>;
  availableUnits: ReadonlyArray<AvailableUnit>;
}

export function ContractTable({ contracts, availableUnits }: ContractTableProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (expiryFilter !== "ALL") {
        const days = Number(expiryFilter);
        if (c.daysToExpire < 0 || c.daysToExpire > days) return false;
      }
      if (q) {
        const hay =
          c.lessee.legalName +
          " " +
          (c.lessee.contactName ?? "") +
          " " +
          c.unit.property.name +
          " " +
          c.unit.code +
          " " +
          (c.unit.name ?? "") +
          " " +
          c.id.slice(-8);
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [contracts, statusFilter, expiryFilter, search]);

  const columns = useMemo<ColumnDef<ContractListItem>[]>(
    () => [
      {
        id: "lessee",
        header: "Inquilino",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.lessee.legalName}</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {row.original.id.slice(-8)}
              {row.original.lessee.contactName
                ? ` · ${row.original.lessee.contactName}`
                : ""}
            </p>
          </div>
        ),
      },
      {
        id: "unit",
        header: "Unidad",
        cell: ({ row }) => (
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{row.original.unit.property.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.unit.code}
              {row.original.unit.name ? ` — ${row.original.unit.name}` : ""}
              {" · "}
              {contractTypeLabel(row.original.type)}
            </p>
          </div>
        ),
      },
      {
        id: "vigency",
        header: () => <div className="text-center">Vigencia</div>,
        cell: ({ row }) => (
          <div className="text-center text-xs tabular-nums text-muted-foreground">
            {capitalizeFirst(DATE.format(row.original.startDate))}
            <span className="mx-1 text-foreground/30">→</span>
            {capitalizeFirst(DATE.format(row.original.endDate))}
          </div>
        ),
      },
      {
        accessorKey: "monthlyAmount",
        header: () => <div className="text-right">Renta</div>,
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">
            {MXN.format(Number(row.original.monthlyAmount))}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: () => <div className="text-center">Estado</div>,
        cell: ({ row }) => (
          <div className="text-center">
            <Badge variant={contractStatusVariant(row.original.status)}>
              {contractStatusLabel(row.original.status)}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: "daysToExpire",
        header: () => <div className="text-center">Vence</div>,
        cell: ({ row }) => {
          const d = row.original.daysToExpire;
          if (row.original.status !== "ACTIVE") {
            return <div className="text-center text-xs text-muted-foreground">—</div>;
          }
          if (d < 0)
            return (
              <div className="text-center text-xs font-medium text-destructive">
                Vencido
              </div>
            );
          const tone =
            d <= 30
              ? "bg-rose-50 text-rose-700 ring-rose-200"
              : d <= 60
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
    ],
    [],
  );

  const table = useReactTable({
    data: filtered as ContractListItem[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar inquilino, unidad o ID..."
              className="pl-8"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            items={statusFilterItems}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Estado" />
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
            value={expiryFilter}
            onValueChange={(v) => setExpiryFilter(v as ExpiryFilter)}
            items={expiryFilterItems}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Vencimiento" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(expiryFilterItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
          <Plus className="size-4" />
          Nuevo contrato
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="min-w-[860px]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No hay contratos para los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  tabIndex={0}
                  role="link"
                  aria-label={`Ver contrato ${row.original.id.slice(-8)}`}
                  className="group cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
                  onClick={() => router.push(`/contracts/${row.original.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/contracts/${row.original.id}`);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length === contracts.length
          ? `${contracts.length} contratos`
          : `${filtered.length} de ${contracts.length} contratos`}
      </p>

      <ContractWizard
        availableUnits={availableUnits}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
