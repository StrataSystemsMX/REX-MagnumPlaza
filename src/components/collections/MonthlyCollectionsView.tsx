"use client";

import {
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  KeyRound,
  Plus,
  Search,
  Store,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { INMUEBLES_TAB_VALUE } from "@/components/shared/property-filter-constants";
import { cn } from "@/lib/utils";
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

const TABLE_COLUMN_COUNT = 6;

interface MonthlyCollectionsViewProps {
  data: MonthlyCollections;
  activePlazaId: string | null;
  /** Toggle Tarjetas/KPIs montado en la barra de acción para ahorrar una fila. */
  modeToggle?: React.ReactNode;
}

export function MonthlyCollectionsView({
  data,
  activePlazaId,
  modeToggle,
}: MonthlyCollectionsViewProps) {
  const [search, setSearch] = useState("");
  const [paymentContext, setPaymentContext] =
    useState<RegisterPaymentDialogContext | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const period = data.period;

  const visibleGroups = useMemo<MonthlyPropertyGroup[]>(() => {
    let groups: MonthlyPropertyGroup[] = [...data.properties];
    if (activePlazaId === INMUEBLES_TAB_VALUE) {
      groups = groups.filter((g) => g.propertyType !== "PLAZA_COMERCIAL");
    } else if (activePlazaId) {
      groups = groups.filter((g) => g.propertyId === activePlazaId);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      groups = groups
        .map((g) => ({
          ...g,
          units: g.units.filter((u) => {
            const haystack = `${u.unitCode} ${u.unitName ?? ""} ${u.lesseeLegalName ?? ""} ${u.lastLesseeName ?? ""}`.toLowerCase();
            return haystack.includes(q);
          }),
        }))
        .filter((g) => g.units.length > 0);
    }
    // Orden: plazas primero, luego inmuebles, ambos alfabéticos.
    return groups.sort((a, b) => {
      const aIsPlaza = a.propertyType === "PLAZA_COMERCIAL" ? 0 : 1;
      const bIsPlaza = b.propertyType === "PLAZA_COMERCIAL" ? 0 : 1;
      if (aIsPlaza !== bIsPlaza) return aIsPlaza - bIsPlaza;
      return a.propertyName.localeCompare(b.propertyName, "es");
    });
  }, [data.properties, activePlazaId, search]);

  // La columna "Local" solo aplica a plazas. Si no hay ninguna plaza visible
  // (p. ej. el tab "Inmuebles"), la quitamos por completo; en vistas mixtas
  // ("Todas") la conservamos para no desalinear la tabla compartida.
  const hideLocalColumn = useMemo(
    () => visibleGroups.every((g) => g.propertyType !== "PLAZA_COMERCIAL"),
    [visibleGroups],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar local o inquilino..."
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {modeToggle}
          <Button onClick={() => setBulkOpen(true)}>
            <Plus className="size-4" />
            Registrar pago
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] caption-bottom text-sm">
          {visibleGroups.length > 0 ? (
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {!hideLocalColumn ? (
                  <TableHead className="w-16 bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Local
                  </TableHead>
                ) : null}
                <TableHead className="bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Inquilino
                </TableHead>
                <TableHead className="w-32 bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Renta Base
                </TableHead>
                <TableHead className="w-32 bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Cobrado
                </TableHead>
                <TableHead className="w-32 bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Estado
                </TableHead>
                <TableHead className="w-24 bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Acción
                </TableHead>
              </TableRow>
            </TableHeader>
          ) : null}
          <TableBody>
            {visibleGroups.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Sin inmuebles para los filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              visibleGroups.map((group) => (
                <PropertyGroupRows
                  key={group.propertyId}
                  group={group}
                  period={period}
                  hideLocalColumn={hideLocalColumn}
                  isCollapsed={collapsed.has(group.propertyId)}
                  onToggle={() => toggleCollapsed(group.propertyId)}
                  onRegisterPayment={setPaymentContext}
                />
              ))
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

// ----------------------------------------------------------------------------
// Property group rows
// ----------------------------------------------------------------------------

interface PropertyGroupRowsProps {
  group: MonthlyPropertyGroup;
  period: Date;
  /** Oculta la columna "Local" en toda la tabla (cuando no hay plazas visibles). */
  hideLocalColumn: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onRegisterPayment: (ctx: RegisterPaymentDialogContext) => void;
}

function PropertyGroupRows({
  group,
  period,
  hideLocalColumn,
  isCollapsed,
  onToggle,
  onRegisterPayment,
}: PropertyGroupRowsProps) {
  const [showAllPaid, setShowAllPaid] = useState(false);
  const isPlaza = group.propertyType === "PLAZA_COMERCIAL";
  const Icon = isPlaza ? Store : Building2;
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;

  // Cuando hay muchas filas pagadas, las colapsamos al final con un toggle.
  const COLLAPSE_THRESHOLD = 4;
  const paidCount = group.units.filter((u) => u.status === "PAID").length;
  const shouldCollapseRows = paidCount > COLLAPSE_THRESHOLD && !showAllPaid;

  const { displayed, hiddenPaidCount } = useMemo(() => {
    if (!shouldCollapseRows) {
      return { displayed: group.units, hiddenPaidCount: 0 };
    }
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
  }, [group.units, shouldCollapseRows]);

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer bg-muted/40 hover:bg-muted/60"
        onClick={onToggle}
      >
        <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-2">
          <div className="flex items-center gap-2">
            <Chevron className="size-4 text-muted-foreground" />
            <Icon className="size-4 text-muted-foreground" />
            <span className="font-medium">{group.propertyName}</span>
            <Badge variant="outline" className="text-[10px]">
              {isPlaza ? "Plaza" : "Inmueble"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {/* Cuando la dueña y la administradora coinciden, basta un código;
                  si difieren (p. ej. QHS dueña, CRT administra) mostramos ambos. */}
              {group.ownerEntityCode === group.managerEntityCode
                ? group.managerEntityCode
                : `Admin. ${group.managerEntityCode} · Dueña ${group.ownerEntityCode}`}
              {/* "N locales" solo aplica a plazas; un inmueble individual no
                  tiene locales internos. */}
              {isPlaza
                ? ` · ${group.unitCount} ${group.unitCount === 1 ? "local" : "locales"}`
                : ""}
            </span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {MXN_INT.format(Number(group.expectedTotal))} esperado
            </span>
          </div>
        </TableCell>
      </TableRow>
      {!isCollapsed && (
        <>
          {displayed.map((row) => (
            <UnitRow
              key={row.unitId}
              row={row}
              period={period}
              propertyName={group.propertyName}
              isPlaza={isPlaza}
              hideLocalColumn={hideLocalColumn}
              onRegisterPayment={onRegisterPayment}
            />
          ))}
          {hiddenPaidCount > 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-2 text-center">
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
        </>
      )}
    </Fragment>
  );
}

// ----------------------------------------------------------------------------
// Unit row
// ----------------------------------------------------------------------------

interface UnitRowProps {
  row: MonthlyUnitRow;
  period: Date;
  propertyName: string;
  /** Solo las plazas muestran código de local; un inmueble individual no. */
  isPlaza: boolean;
  /** Cuando la columna "Local" está oculta en toda la tabla, no renderiza la celda. */
  hideLocalColumn: boolean;
  onRegisterPayment: (ctx: RegisterPaymentDialogContext) => void;
}

function UnitRow({
  row,
  period,
  propertyName,
  isPlaza,
  hideLocalColumn,
  onRegisterPayment,
}: UnitRowProps) {
  const rowClass = ROW_BG_BY_STATUS[row.status];
  const action = renderAction(row, period, propertyName, isPlaza, onRegisterPayment);

  return (
    <TableRow className={cn("border-b last:border-b-0", rowClass)}>
      {/* "Local" solo en plazas. En vistas mixtas la celda va vacía para
          inmuebles (mantiene alineación); si la columna está oculta, no se renderiza. */}
      {!hideLocalColumn ? (
        <TableCell className="font-mono text-xs">{isPlaza ? row.unitCode : ""}</TableCell>
      ) : null}
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
      <TableCell className="text-right">{action}</TableCell>
    </TableRow>
  );
}

const ROW_BG_BY_STATUS: Record<MonthlyUnitStatus, string> = {
  PAID: "",
  PARTIAL: "bg-amber-50/50 dark:bg-amber-950/20",
  SIN_PAGO: "bg-red-50/50 dark:bg-red-950/20",
  FUTURO: "bg-slate-50/60 dark:bg-slate-900/30",
  WAIVED: "bg-blue-50/40 dark:bg-blue-950/20",
  VACANT: "bg-muted/30",
};

// ----------------------------------------------------------------------------
// Cobrado cell
// ----------------------------------------------------------------------------

function CobradoCell({ row }: { row: MonthlyUnitRow }) {
  if (row.status === "VACANT" || row.status === "FUTURO") {
    return <span className="text-muted-foreground">—</span>;
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
    case "SIN_PAGO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          × Sin pago
        </span>
      );
    case "FUTURO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          No vencido
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
  isPlaza: boolean,
  onRegisterPayment: (ctx: RegisterPaymentDialogContext) => void,
) {
  if (row.status === "VACANT") {
    // Abre el wizard de nuevo contrato en /contracts con esta unidad ya
    // preseleccionada (no existe una página /contracts/new).
    return (
      <Link
        href={`/contracts?nuevo=1&unitId=${encodeURIComponent(row.unitId)}`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5")}
      >
        <KeyRound className="size-3.5" />
        Rentar
      </Link>
    );
  }
  if (row.rentId && (row.overdueLevel === 2 || row.overdueLevel === 3)) {
    const level = row.overdueLevel === 3 ? "3M" : "2M";
    return (
      <SendNotificationDialog
        rentId={row.rentId}
        level={level}
        lessee={{
          legalName: row.lesseeLegalName ?? "",
          whatsapp: row.lesseeWhatsapp,
          email: row.lesseeEmail,
          preferredChannel: row.lesseePreferredChannel ?? "WHATSAPP",
        }}
      />
    );
  }
  if (row.rentId && (row.status === "SIN_PAGO" || row.overdueLevel === 1)) {
    return (
      <SendNotificationDialog
        rentId={row.rentId}
        level="1M"
        lessee={{
          legalName: row.lesseeLegalName ?? "",
          whatsapp: row.lesseeWhatsapp,
          email: row.lesseeEmail,
          preferredChannel: row.lesseePreferredChannel ?? "WHATSAPP",
        }}
      />
    );
  }

  // PAID, PARTIAL → "Ver" abre dialog para registrar pago si hay rent.
  if (row.rentId) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5"
        onClick={() =>
          onRegisterPayment({
            rentId: row.rentId!,
            amountDue: row.amountDue,
            amountPaid: row.amountPaid,
            period,
            lesseeName: row.lesseeLegalName ?? "",
            unitLabel: isPlaza ? `${propertyName} ${row.unitCode}` : propertyName,
          })
        }
      >
        <Eye className="size-3.5" />
        Ver
      </Button>
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
