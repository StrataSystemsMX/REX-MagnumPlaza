"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";
import { Download, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { paymentMethodLabel } from "@/lib/i18n/enums";
import { actionDeletePayment } from "@/lib/services/payments";
import type { PaymentListItem } from "@/lib/services/payments-queries";
import type { PaymentMethod } from "@/generated/prisma/enums";

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

const PERIOD = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const METHODS: ReadonlyArray<PaymentMethod> = [
  "TRANSFER",
  "CASH",
  "CHECK",
  "DEPOSIT",
  "CARD",
  "OTHER",
];

const methodFilterItems: Record<string, string> = {
  ALL: "Todos los métodos",
  ...Object.fromEntries(METHODS.map((m) => [m, paymentMethodLabel(m)])),
};

interface PaymentsTableProps {
  payments: ReadonlyArray<PaymentListItem>;
  /** Si el usuario es MASTER, muestra el botón de borrar. */
  canDelete: boolean;
}

export function PaymentsTable({ payments, canDelete }: PaymentsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "ALL">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PaymentListItem | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    return payments.filter((p) => {
      if (methodFilter !== "ALL" && p.method !== methodFilter) return false;
      if (fromDate && p.paymentDate < fromDate) return false;
      if (toDate && p.paymentDate > toDate) return false;
      if (q) {
        const haystack =
          p.rent.contract.lessee.legalName.toLowerCase() +
          " " +
          (p.reference?.toLowerCase() ?? "") +
          " " +
          p.rent.contract.unit.property.name.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [payments, search, methodFilter, from, to]);

  const totalAmount = useMemo(
    () => filtered.reduce((acc, p) => acc + Number(p.amount), 0),
    [filtered],
  );

  function downloadCsv() {
    const header = [
      "Fecha",
      "Inquilino",
      "Inmueble",
      "Unidad",
      "Periodo",
      "Monto",
      "Metodo",
      "Referencia",
    ];
    const rows = filtered.map((p) => [
      p.paymentDate.toISOString().slice(0, 10),
      p.rent.contract.lessee.legalName,
      p.rent.contract.unit.property.name,
      p.rent.contract.unit.code,
      p.rent.period.toISOString().slice(0, 7),
      Number(p.amount).toFixed(2),
      p.method,
      p.reference ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = useMemo<ColumnDef<PaymentListItem>[]>(
    () => [
      {
        accessorKey: "paymentDate",
        header: "Fecha",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {DATE.format(row.original.paymentDate)}
          </span>
        ),
      },
      {
        id: "lessee",
        header: "Inquilino",
        cell: ({ row }) => (
          <span className="text-sm font-medium">
            {row.original.rent.contract.lessee.legalName}
          </span>
        ),
      },
      {
        id: "unit",
        header: "Unidad",
        cell: ({ row }) => (
          <div className="text-sm">
            <p>{row.original.rent.contract.unit.property.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.rent.contract.unit.code}
            </p>
          </div>
        ),
      },
      {
        id: "period",
        header: "Periodo",
        cell: ({ row }) => (
          <span className="text-sm capitalize">
            {PERIOD.format(row.original.rent.period)}
          </span>
        ),
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">
            {MXN.format(Number(row.original.amount))}
          </span>
        ),
      },
      {
        accessorKey: "method",
        header: "Método",
        cell: ({ row }) => (
          <Badge variant="secondary">{paymentMethodLabel(row.original.method)}</Badge>
        ),
      },
      {
        accessorKey: "reference",
        header: "Referencia",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.reference ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => {
          if (!canDelete) return null;
          return (
            <div className="text-right">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteTarget(row.original)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [canDelete],
  );

  const table = useReactTable({
    data: filtered as PaymentListItem[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeletePayment(target.id);
        toast.success("Pago eliminado. Se recalculó el estado de la renta.");
        setDeleteTarget(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={methodFilter}
            onValueChange={(v) => v && setMethodFilter(v as PaymentMethod | "ALL")}
            items={methodFilterItems}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(methodFilterItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {filtered.length} pago{filtered.length === 1 ? "" : "s"}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {MXN.format(totalAmount)}
            </p>
          </div>
          <Button variant="secondary" onClick={downloadCsv}>
            <Download className="size-4" />
            Exportar CSV
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
                  Sin pagos para los filtros aplicados.
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción borra el Payment y recalcula el estado de la renta. Solo el
              rol MASTER puede ejecutarla. Queda registrado en AuditLog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={pending}
            >
              {pending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
