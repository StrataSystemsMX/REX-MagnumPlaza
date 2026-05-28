"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Trash2,
  Users2,
  Wallet,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { PayrollFormDialog } from "@/components/nominas/PayrollFormDialog";
import { PayrollDetailDialog } from "@/components/nominas/PayrollDetailDialog";
import { themeFor } from "@/components/cierres/MonthlyPivotTable";
import { actionDeletePayroll } from "@/lib/services/payroll";
import type {
  PayrollEntityTotal,
  PayrollListItem,
} from "@/lib/services/payroll-queries";
import type { LegalEntityOption } from "@/lib/services/properties-queries";
import { payrollTypeLabel } from "@/lib/i18n/enums";
import type { PayrollType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

// Clasificación contable: operativos (gente real) vs estrategia fiscal
// (vehículos fiscales). Usado para sub-agrupar dentro de cada card.
const FISCAL_STRATEGY_TYPES: ReadonlySet<PayrollType> = new Set([
  "STRATEGY_NOMINA",
  "ADMIN_SERVICE_INVOICE",
]);
function isFiscalStrategy(t: PayrollType): boolean {
  return FISCAL_STRATEGY_TYPES.has(t);
}

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const MONTH_ITEMS: Record<string, string> = {
  "0": "Todo el año",
  "1": "Enero",
  "2": "Febrero",
  "3": "Marzo",
  "4": "Abril",
  "5": "Mayo",
  "6": "Junio",
  "7": "Julio",
  "8": "Agosto",
  "9": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
};

const TYPE_TONES: Record<PayrollType, string> = {
  ADMIN_SERVICE_INVOICE:
    "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200",
  DIRECT_PAYROLL:
    "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200",
  STRATEGY_NOMINA:
    "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200",
  COMMISSION:
    "bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-200",
  BONUS:
    "bg-pink-100 text-pink-700 hover:bg-pink-100 dark:bg-pink-950 dark:text-pink-200",
};

// Template de grid compartido entre las dos subsecciones (Operativos /
// Estrategia fiscal) para que las columnas queden alineadas a la misma X,
// análogo a PREDIAL_GRID_COLS en PredialesTable.
// Tipo | Concepto(+notas) | Sin IVA | IVA | Total | Acciones
const PAYROLL_GRID_COLS =
  "minmax(0, 0.9fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 40px";
// Con columna Mes (vista anual) antepuesta.
const PAYROLL_GRID_COLS_WITH_MONTH =
  "minmax(0, 0.7fr) minmax(0, 0.9fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 40px";

interface Props {
  payrolls: ReadonlyArray<PayrollListItem>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  annualTotals: ReadonlyArray<PayrollEntityTotal>;
  yearsAvailable: ReadonlyArray<number>;
  selectedYear: number;
  /** null = todo el año */
  selectedMonth: number | null;
  selectedEntityId: string | null;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Restringe los tipos seleccionables en el dialog. */
  allowedTypes?: ReadonlyArray<PayrollType>;
}

export function NominasView({
  payrolls,
  legalEntities,
  annualTotals,
  yearsAvailable,
  selectedYear,
  selectedMonth,
  selectedEntityId,
  canCreate,
  canUpdate,
  canDelete,
  allowedTypes,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formInitial, setFormInitial] = useState<PayrollListItem | null>(null);
  const [formPrefillEntity, setFormPrefillEntity] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<PayrollListItem | null>(
    null,
  );
  const [detailTarget, setDetailTarget] = useState<PayrollListItem | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  function toggleGroup(entityId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }

  const yearItems: Record<string, string> = useMemo(
    () => Object.fromEntries(yearsAvailable.map((y) => [String(y), String(y)])),
    [yearsAvailable],
  );

  const entityItems: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = { ALL: "Todas" };
    for (const e of legalEntities) map[e.id] = e.code;
    return map;
  }, [legalEntities]);

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    router.push(`/nominas?${params.toString()}`);
  }

  function changeMonthParam(value: string) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return;
    pushParams({ month: String(n) });
  }

  function shiftMonth(delta: number) {
    if (selectedMonth === null) return;
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    pushParams({ year: String(y), month: String(m) });
  }

  // Totales del periodo visible — separados operativo vs estrategia fiscal.
  const { periodOperationalTotal, periodFiscalTotal } = useMemo(() => {
    let op = 0;
    let fisc = 0;
    for (const p of payrolls) {
      if (isFiscalStrategy(p.type)) fisc += p.amount;
      else op += p.amount;
    }
    return { periodOperationalTotal: op, periodFiscalTotal: fisc };
  }, [payrolls]);
  const annualTotal = useMemo(
    () => annualTotals.reduce((sum, e) => sum + e.total, 0),
    [annualTotals],
  );

  // Agrupa los pagos del periodo por LegalEntity y dentro de cada entidad
  // separa operativos de estrategia fiscal.
  const byEntity = useMemo(() => {
    const groups = new Map<
      string,
      {
        entity: PayrollListItem["legalEntity"];
        operationalItems: PayrollListItem[];
        fiscalItems: PayrollListItem[];
        operationalTotal: number;
        fiscalTotal: number;
        total: number;
      }
    >();
    for (const p of payrolls) {
      const key = p.legalEntity.id;
      const fiscal = isFiscalStrategy(p.type);
      const cur = groups.get(key);
      if (cur) {
        if (fiscal) {
          cur.fiscalItems.push(p);
          cur.fiscalTotal += p.amount;
        } else {
          cur.operationalItems.push(p);
          cur.operationalTotal += p.amount;
        }
        cur.total += p.amount;
      } else {
        groups.set(key, {
          entity: p.legalEntity,
          operationalItems: fiscal ? [] : [p],
          fiscalItems: fiscal ? [p] : [],
          operationalTotal: fiscal ? 0 : p.amount,
          fiscalTotal: fiscal ? p.amount : 0,
          total: p.amount,
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.entity.code.localeCompare(b.entity.code, "es-MX"),
    );
  }, [payrolls]);

  function periodLabel(): string {
    if (selectedMonth === null) return `Año ${selectedYear}`;
    return `${MONTH_LABELS[selectedMonth - 1]} ${selectedYear}`;
  }

  function openCreate(prefillEntityId: string | null = null) {
    setFormInitial(null);
    setFormPrefillEntity(prefillEntityId);
    setFormMode("create");
  }

  function openEdit(item: PayrollListItem) {
    setFormInitial(item);
    setFormPrefillEntity(null);
    setFormMode("edit");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeletePayroll({ id: target.id });
        toast.success("Pago de nómina eliminado.");
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al eliminar.");
      }
    });
  }

  return (
    <>
      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => v && pushParams({ year: v })}
            items={yearItems}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearsAvailable.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => shiftMonth(-1)}
              disabled={selectedMonth === null}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Select
              value={String(selectedMonth ?? 0)}
              onValueChange={(v) => v && changeMonthParam(v)}
              items={MONTH_ITEMS}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MONTH_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => shiftMonth(1)}
              disabled={selectedMonth === null}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <Select
            value={selectedEntityId ?? "ALL"}
            onValueChange={(v) =>
              v && pushParams({ entity: v === "ALL" ? null : v })
            }
            items={entityItems}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(entityItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canCreate ? (
          <Button onClick={() => openCreate(null)}>
            <Plus className="size-4" />
            Registrar pago
          </Button>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Receipt className="size-4" />}
          label={`Operativo ${periodLabel().toLowerCase()}`}
          value={MXN.format(periodOperationalTotal)}
          subtitle="Nómina directa, comisiones, bonos"
          tone="primary"
        />
        <Stat
          icon={<PiggyBank className="size-4" />}
          label={`Estrategia fiscal ${periodLabel().toLowerCase()}`}
          value={MXN.format(periodFiscalTotal)}
          subtitle="Nómina estratégica + facturas adm."
          tone="warning"
        />
        <Stat
          icon={<Users2 className="size-4" />}
          label="Movimientos"
          value={String(payrolls.length)}
          subtitle={
            payrolls.length === 1 ? "1 pago en el periodo" : `${payrolls.length} pagos en el periodo`
          }
        />
        <Stat
          icon={<Wallet className="size-4" />}
          label={`Total año ${selectedYear}`}
          value={MXN.format(annualTotal)}
          tone="positive"
        />
      </div>

      {/* Cards por razón social — color por entidad, sub-secciones operativo/estrategia */}
      <div className="space-y-4">
        {byEntity.length === 0 ? (
          <EmptyState
            periodLabel={periodLabel()}
            canCreate={canCreate}
            onCreate={() => openCreate(null)}
          />
        ) : (
          byEntity.map((group) => {
            const theme = themeFor(group.entity.code);
            const totalCount = group.operationalItems.length + group.fiscalItems.length;
            const expanded = !collapsed.has(group.entity.id);
            return (
              <div
                key={group.entity.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card ring-1",
                  theme.ring,
                )}
              >
                {/* Header colapsable. La zona izquierda (info + total) hace
                    toggle; el botón "Agregar" queda fuera para no anidar. */}
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3",
                    theme.soft,
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(group.entity.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleGroup(group.entity.id);
                      }
                    }}
                    className="flex flex-1 cursor-pointer items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {expanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </span>
                    <span
                      className={cn("size-2.5 shrink-0 rounded-full", theme.dot)}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold tracking-tight">
                          {group.entity.code}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                            theme.badge,
                          )}
                        >
                          {totalCount}{" "}
                          {totalCount === 1 ? "movimiento" : "movimientos"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          — {group.entity.legalName}
                        </span>
                      </div>
                      {group.fiscalTotal > 0 && group.operationalTotal > 0 ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Operativo {MXN.format(group.operationalTotal)} ·
                          Estrategia {MXN.format(group.fiscalTotal)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Total
                      </p>
                      <p className="text-lg font-semibold tabular-nums">
                        {MXN.format(group.total)}
                      </p>
                    </div>
                    {canCreate ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCreate(group.entity.id)}
                      >
                        <Plus className="size-3.5" />
                        Agregar
                      </Button>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <>
                    <PayrollSubsection
                      title="Operativos"
                      helper="Nómina directa, comisiones, bonos."
                      tone="emerald"
                      items={group.operationalItems}
                      subtotal={group.operationalTotal}
                      showMonth={selectedMonth === null}
                      canUpdate={canUpdate}
                      canDelete={canDelete}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                      onSelect={setDetailTarget}
                    />

                    <PayrollSubsection
                      title="Estrategia fiscal"
                      helper="Nómina estratégica y facturas administrativas."
                      tone="amber"
                      items={group.fiscalItems}
                      subtotal={group.fiscalTotal}
                      showMonth={selectedMonth === null}
                      canUpdate={canUpdate}
                      canDelete={canDelete}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                      onSelect={setDetailTarget}
                    />
                  </>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <PayrollFormDialog
        mode={formMode}
        initial={formInitial}
        legalEntities={legalEntities}
        defaultYear={selectedYear}
        defaultMonth={selectedMonth ?? new Date().getUTCMonth() + 1}
        prefillEntityId={formPrefillEntity}
        allowedTypes={allowedTypes}
        onClose={() => {
          setFormMode(null);
          setFormInitial(null);
          setFormPrefillEntity(null);
        }}
      />

      <PayrollDetailDialog
        item={detailTarget}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onClose={() => setDetailTarget(null)}
        onEdit={(item) => {
          setDetailTarget(null);
          openEdit(item);
        }}
        onDelete={(item) => {
          setDetailTarget(null);
          setDeleteTarget(item);
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !pending && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pago de nómina?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Se borrará el pago de ${MXN.format(deleteTarget.amount)} de ${deleteTarget.legalEntity.code} (${MONTH_LABELS[deleteTarget.month - 1]} ${deleteTarget.year}). Esta acción no se puede deshacer.`
                : ""}
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
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone?: "primary" | "positive" | "warning" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "positive"
        ? "text-emerald-700 dark:text-emerald-300"
        : tone === "warning"
          ? "text-amber-700 dark:text-amber-300"
          : tone === "muted"
            ? "text-muted-foreground"
            : "";
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {subtitle ? (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

function PayrollSubsection({
  title,
  helper,
  tone,
  items,
  subtotal,
  showMonth,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
  onSelect,
}: {
  title: string;
  helper: string;
  tone: "emerald" | "amber";
  items: PayrollListItem[];
  subtotal: number;
  showMonth: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (item: PayrollListItem) => void;
  onDelete: (item: PayrollListItem) => void;
  onSelect: (item: PayrollListItem) => void;
}) {
  if (items.length === 0) return null;

  const accentText =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-amber-700 dark:text-amber-400";

  const gridCols = showMonth
    ? PAYROLL_GRID_COLS_WITH_MONTH
    : PAYROLL_GRID_COLS;

  return (
    <div className="border-b last:border-b-0">
      {/* Barra de subsección: label + helper + subtotal */}
      <div className="flex items-center justify-between gap-2 bg-muted/20 px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wider",
              accentText,
            )}
          >
            {title}
          </span>
          <span className="text-[10px] text-muted-foreground">{helper}</span>
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {MXN.format(subtotal)}
        </span>
      </div>

      {/* Tabla en grid (template compartido para alinear columnas) */}
      <div role="table" aria-label={title}>
        <div
          role="row"
          className="grid items-center border-b bg-muted/30 text-[11px] font-medium uppercase text-muted-foreground"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div role="columnheader" className="px-3 py-2">
            Tipo
          </div>
          {showMonth ? (
            <div role="columnheader" className="px-3 py-2">
              Mes
            </div>
          ) : null}
          <div role="columnheader" className="px-3 py-2">
            Concepto
          </div>
          <div role="columnheader" className="px-3 py-2 text-right">
            Sin IVA
          </div>
          <div role="columnheader" className="px-3 py-2 text-right">
            IVA
          </div>
          <div role="columnheader" className="px-3 py-2 text-right">
            Total
          </div>
          <div role="columnheader" aria-label="Acciones" />
        </div>
        {items.map((item) => (
          <PayrollRow
            key={item.id}
            item={item}
            gridCols={gridCols}
            showMonth={showMonth}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onEdit={onEdit}
            onDelete={onDelete}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function PayrollRow({
  item,
  gridCols,
  showMonth,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
  onSelect,
}: {
  item: PayrollListItem;
  gridCols: string;
  showMonth: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (item: PayrollListItem) => void;
  onDelete: (item: PayrollListItem) => void;
  onSelect: (item: PayrollListItem) => void;
}) {
  return (
    <div
      role="row"
      onClick={() => onSelect(item)}
      className="grid cursor-pointer items-center border-b text-sm transition-colors last:border-b-0 hover:bg-muted/50"
      style={{ gridTemplateColumns: gridCols }}
    >
      <div role="cell" className="px-3 py-2.5">
        <Badge className={TYPE_TONES[item.type]}>
          {payrollTypeLabel(item.type)}
        </Badge>
      </div>
      {showMonth ? (
        <div
          role="cell"
          className="px-3 py-2.5 text-xs text-muted-foreground"
        >
          {MONTH_LABELS[item.month - 1]}
        </div>
      ) : null}
      <div role="cell" className="min-w-0 px-3 py-2.5">
        <p className="line-clamp-2">{item.description ?? "—"}</p>
        {item.notes ? (
          <p className="truncate text-xs text-muted-foreground">
            {item.notes}
          </p>
        ) : null}
      </div>
      <div
        role="cell"
        className="px-3 py-2.5 text-right tabular-nums text-muted-foreground"
      >
        {item.amountWithoutTax !== null
          ? MXN.format(item.amountWithoutTax)
          : "—"}
      </div>
      <div
        role="cell"
        className="px-3 py-2.5 text-right tabular-nums text-muted-foreground"
      >
        {item.taxAmount !== null ? MXN.format(item.taxAmount) : "—"}
      </div>
      <div
        role="cell"
        className="px-3 py-2.5 text-right font-semibold tabular-nums"
      >
        {MXN.format(item.amount)}
      </div>
      <div role="cell" className="flex justify-end pr-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" />}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Acciones</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canUpdate ? (
              <DropdownMenuItem onClick={() => onEdit(item)}>
                <Pencil className="size-4" />
                Editar
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem onClick={() => onDelete(item)}>
                <Trash2 className="size-4 text-destructive" />
                Eliminar
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function EmptyState({
  periodLabel,
  canCreate,
  onCreate,
}: {
  periodLabel: string;
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card p-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Users2 className="size-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">Sin pagos en {periodLabel}</p>
        <p className="text-xs text-muted-foreground">
          Registra el primer pago de nómina para esta periodo.
        </p>
      </div>
      {canCreate ? (
        <Button onClick={onCreate}>
          <Plus className="size-4" />
          Registrar pago
        </Button>
      ) : null}
    </div>
  );
}
