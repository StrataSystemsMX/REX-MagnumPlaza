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
  Download,
  FileDown,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { INMUEBLES_TAB_VALUE } from "@/components/shared/property-filter-constants";
import { paymentMethodLabel } from "@/lib/i18n/enums";
import { actionDeletePayment } from "@/lib/services/payments";
import type { PaymentListItem } from "@/lib/services/payments-queries";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { capitalizeFirst, cn } from "@/lib/utils";

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
  /** Filtro de plaza/inmueble desde el PropertyFilterTabs a nivel de página. */
  activePlazaId: string | null;
}

export function PaymentsTable({
  payments,
  canDelete,
  activePlazaId,
}: PaymentsTableProps) {
  const router = useRouter();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "ALL">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PaymentListItem | null>(null);
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleGroup(unitId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    return payments.filter((p) => {
      if (methodFilter !== "ALL" && p.method !== methodFilter) return false;
      if (fromDate && p.paymentDate < fromDate) return false;
      if (toDate && p.paymentDate > toDate) return false;
      if (activePlazaId === INMUEBLES_TAB_VALUE) {
        if (p.rent.contract.unit.property.type === "PLAZA_COMERCIAL") return false;
      } else if (activePlazaId) {
        if (p.rent.contract.unit.property.id !== activePlazaId) return false;
      }
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
  }, [payments, search, methodFilter, from, to, activePlazaId]);

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
      // En inmuebles individuales la columna "Inmueble" ya identifica todo; el
      // código de local solo aplica a plazas.
      p.rent.contract.unit.property.type === "PLAZA_COMERCIAL"
        ? p.rent.contract.unit.code
        : "",
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

  function buildPdfUrl() {
    const params = new URLSearchParams();
    // Siempre envía las fechas; si no se eligió, usa hoy para que el PDF lo indique
    params.set("from", from || todayStr);
    params.set("to", to || todayStr);
    if (methodFilter !== "ALL") params.set("method", methodFilter);
    if (search.trim()) params.set("search", search.trim());
    if (activePlazaId) params.set("plazaId", activePlazaId);
    return `/api/documents/payments-history?${params.toString()}`;
  }

  const columns = useMemo<ColumnDef<PaymentListItem>[]>(
    () => [
      {
        id: "lessee",
        header: "Inquilino",
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/lessees/${row.original.rent.contract.lessee.id}`}
              className="truncate font-medium hover:underline"
            >
              {row.original.rent.contract.lessee.legalName}
            </Link>
            {row.original.rent.contract.lessee.contactName ? (
              <p className="truncate text-[10px] text-muted-foreground">
                {row.original.rent.contract.lessee.contactName}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "paymentDate",
        header: "Fecha",
        cell: ({ row }) => (
          <div className="text-center text-xs tabular-nums text-muted-foreground">
            {capitalizeFirst(DATE.format(row.original.paymentDate))}
          </div>
        ),
      },
      {
        id: "period",
        header: "Periodo",
        cell: ({ row }) => (
          <div className="text-center text-xs tabular-nums text-muted-foreground">
            {capitalizeFirst(PERIOD.format(row.original.rent.period))}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">
            {MXN.format(Number(row.original.amount))}
          </div>
        ),
      },
      {
        accessorKey: "method",
        header: "Método",
        cell: ({ row }) => (
          <div className="text-center">
            <Badge variant="secondary">{paymentMethodLabel(row.original.method)}</Badge>
          </div>
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

  const tableRows = table.getRowModel().rows;
  const groupedRows = useMemo(() => {
    const map = new Map<
      string,
      {
        unit: PaymentListItem["rent"]["contract"]["unit"];
        rows: Row<PaymentListItem>[];
      }
    >();
    for (const row of tableRows) {
      const unit = row.original.rent.contract.unit;
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar inquilino o inmueble..."
              className="pl-8"
            />
          </div>
          <Select
            value={methodFilter}
            onValueChange={(v) => v && setMethodFilter(v as PaymentMethod | "ALL")}
            items={methodFilterItems}
          >
            <SelectTrigger className="w-full sm:w-40">
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="payments-from"
                className="text-xs font-medium text-muted-foreground"
              >
                Desde
              </label>
              <Input
                id="payments-from"
                type="date"
                value={from || todayStr}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className={cn("w-full sm:w-40", !from && "text-muted-foreground opacity-50")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="payments-to"
                className="text-xs font-medium text-muted-foreground"
              >
                Hasta
              </label>
              <Input
                id="payments-to"
                type="date"
                value={to || todayStr}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className={cn("w-full sm:w-40", !to && "text-muted-foreground opacity-50")}
              />
            </div>
            {(from || to) && (
              <button
                type="button"
                onClick={() => { setFrom(""); setTo(""); }}
                className="self-end pb-1 text-muted-foreground hover:text-foreground"
                title="Borrar fechas"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="text-left sm:text-right">
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
          <Button
            variant="secondary"
            onClick={() => window.open(buildPdfUrl(), "_blank", "noopener,noreferrer")}
          >
            <FileDown className="size-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Usamos una <table> cruda (no el componente Table de shadcn) porque ese
          envuelve la tabla en un div con overflow-x-auto, y ese contenedor de
          scroll atrapa el `sticky` (se ancla al div, no al scroll de la página).
          overflow-clip recorta las esquinas redondeadas SIN crear contenedor de
          scroll, así que conserva el sticky relativo al <main>. */}
      <div className="overflow-clip rounded-lg border bg-card">
        <table className="w-full min-w-[720px] caption-bottom text-sm">
          {/* El scroll vive en <main>, con padding superior (p-4/6/8). El offset de
              `sticky` se mide desde el borde de contenido (tras el padding), así que
              `top-0` dejaría una franja donde se asoman las filas; el top negativo
              iguala ese padding para anclar el encabezado al borde superior real.
              (Acoplado al padding de (dashboard)/layout.tsx.) */}
          <TableHeader className="sticky -top-4 z-20 sm:-top-6 lg:-top-8">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const align =
                    h.column.id === "lessee"
                      ? ""
                      : h.column.id === "actions" || h.column.id === "amount"
                        ? "text-right"
                        : h.column.id === "reference"
                          ? ""
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
                  Sin pagos para los filtros aplicados.
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
                            {group.rows.length === 1 ? "pago" : "pagos"}
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
