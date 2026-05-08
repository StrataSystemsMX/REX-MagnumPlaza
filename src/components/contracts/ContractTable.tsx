"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";
import { ExternalLink, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { capitalizeFirst } from "@/lib/utils";

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
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (expiryFilter !== "ALL") {
        const days = Number(expiryFilter);
        if (c.daysToExpire < 0 || c.daysToExpire > days) return false;
      }
      return true;
    });
  }, [contracts, statusFilter, expiryFilter]);

  const columns = useMemo<ColumnDef<ContractListItem>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Contrato",
        cell: ({ row }) => (
          <Link
            href={`/contracts/${row.original.id}`}
            className="font-mono text-xs hover:underline"
          >
            {row.original.id.slice(-8)}
          </Link>
        ),
      },
      {
        id: "lessee",
        header: "Inquilino",
        cell: ({ row }) => (
          <div className="text-sm">
            <p className="font-medium">{row.original.lessee.legalName}</p>
            {row.original.lessee.contactName ? (
              <p className="text-xs text-muted-foreground">
                {row.original.lessee.contactName}
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
            <p className="font-medium">{row.original.unit.property.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.unit.code}
              {row.original.unit.name ? ` — ${row.original.unit.name}` : ""}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Tipo",
        cell: ({ row }) => (
          <span className="text-sm">{contractTypeLabel(row.original.type)}</span>
        ),
      },
      {
        id: "vigency",
        header: "Vigencia",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {capitalizeFirst(DATE.format(row.original.startDate))} → {capitalizeFirst(DATE.format(row.original.endDate))}
          </span>
        ),
      },
      {
        accessorKey: "monthlyAmount",
        header: () => <span className="text-right">Renta</span>,
        cell: ({ row }) => (
          <span className="text-right tabular-nums">
            {MXN.format(Number(row.original.monthlyAmount))}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={contractStatusVariant(row.original.status)}>
            {contractStatusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: "daysToExpire",
        header: "Vence",
        cell: ({ row }) => {
          const d = row.original.daysToExpire;
          if (row.original.status !== "ACTIVE") {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          if (d < 0) return <span className="text-xs text-destructive">Vencido</span>;
          if (d <= 30)
            return <span className="text-xs font-medium text-destructive">{d}d</span>;
          if (d <= 60)
            return <span className="text-xs font-medium">{d}d</span>;
          return <span className="text-xs text-muted-foreground">{d}d</span>;
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Acciones</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link href={`/contracts/${row.original.id}`} />}>
                  <ExternalLink className="size-4" />
                  Ver detalle
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            items={statusFilterItems}
          >
            <SelectTrigger className="w-48">
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
            <SelectTrigger className="w-56">
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

        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Nuevo Contrato
        </Button>
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
                  No hay contratos para los filtros seleccionados.
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

      <ContractWizard
        availableUnits={availableUnits}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
