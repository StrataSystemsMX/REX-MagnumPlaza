"use client";

import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
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
import { actionDeletePayroll } from "@/lib/services/payroll";
import type {
  PayrollEntityTotal,
  PayrollListItem,
} from "@/lib/services/payroll-queries";
import type { LegalEntityOption } from "@/lib/services/properties-queries";
import { payrollTypeLabel } from "@/lib/i18n/enums";
import type { PayrollType } from "@/generated/prisma/enums";

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

  // Totales del periodo visible.
  const periodTotal = useMemo(
    () => payrolls.reduce((sum, p) => sum + p.amount, 0),
    [payrolls],
  );
  const periodTaxTotal = useMemo(
    () => payrolls.reduce((sum, p) => sum + (p.taxAmount ?? 0), 0),
    [payrolls],
  );
  const annualTotal = useMemo(
    () => annualTotals.reduce((sum, e) => sum + e.total, 0),
    [annualTotals],
  );

  // Agrupa los pagos del periodo por LegalEntity.
  const byEntity = useMemo(() => {
    const groups = new Map<
      string,
      {
        entity: PayrollListItem["legalEntity"];
        items: PayrollListItem[];
        total: number;
      }
    >();
    for (const p of payrolls) {
      const key = p.legalEntity.id;
      const cur = groups.get(key);
      if (cur) {
        cur.items.push(p);
        cur.total += p.amount;
      } else {
        groups.set(key, {
          entity: p.legalEntity,
          items: [p],
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Año">
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
          </FilterField>

          <FilterField label="Periodo">
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
          </FilterField>

          <FilterField label="Razón social">
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
          </FilterField>
        </div>

        {canCreate ? (
          <Button onClick={() => openCreate(null)}>
            <Plus className="size-4" />
            Nuevo pago
          </Button>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Wallet className="size-4" />}
          label={`Total ${periodLabel().toLowerCase()}`}
          value={MXN.format(periodTotal)}
          tone="primary"
        />
        <Stat
          icon={<Users2 className="size-4" />}
          label="Movimientos"
          value={String(payrolls.length)}
          subtitle={
            payrolls.length === 1 ? "1 pago registrado" : `${payrolls.length} pagos registrados`
          }
        />
        <Stat
          icon={<Building2 className="size-4" />}
          label={`IVA ${periodLabel().toLowerCase()}`}
          value={MXN.format(periodTaxTotal)}
          tone="muted"
        />
        <Stat
          icon={<Wallet className="size-4" />}
          label={`Total año ${selectedYear}`}
          value={MXN.format(annualTotal)}
          tone="positive"
        />
      </div>

      {/* Resumen anual por entidad — sólo si la lista no está vacía */}
      {annualTotals.length > 0 ? (
        <div className="rounded-md border bg-card p-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
            Acumulado anual por razón social
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {annualTotals.map((e) => (
              <div
                key={e.id}
                className="flex flex-col gap-1 rounded-md border bg-background p-3"
              >
                <Badge variant="secondary" className="w-fit">
                  {e.code}
                </Badge>
                <p className="truncate text-xs text-muted-foreground">
                  {e.legalName}
                </p>
                <p className="text-base font-semibold tabular-nums">
                  {MXN.format(e.total)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Cards por razón social */}
      <div className="space-y-4">
        {byEntity.length === 0 ? (
          <EmptyState
            periodLabel={periodLabel()}
            canCreate={canCreate}
            onCreate={() => openCreate(null)}
          />
        ) : (
          byEntity.map((group) => (
            <div
              key={group.entity.id}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{group.entity.code}</Badge>
                      <span className="text-sm font-medium">
                        {group.entity.legalName}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {group.items.length}{" "}
                      {group.items.length === 1 ? "movimiento" : "movimientos"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Total
                    </p>
                    <p className="text-base font-semibold tabular-nums">
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

              <ul className="divide-y">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={TYPE_TONES[item.type]}>
                          {payrollTypeLabel(item.type)}
                        </Badge>
                        {selectedMonth === null ? (
                          <span className="text-xs text-muted-foreground">
                            {MONTH_LABELS[item.month - 1]}
                          </span>
                        ) : null}
                        {item.description ? (
                          <span className="truncate text-sm">
                            {item.description}
                          </span>
                        ) : null}
                      </div>
                      {item.notes ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-base font-semibold tabular-nums">
                          {MXN.format(item.amount)}
                        </p>
                        {item.amountWithoutTax !== null ||
                        item.taxAmount !== null ? (
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {item.amountWithoutTax !== null
                              ? `Sin IVA ${MXN.format(item.amountWithoutTax)}`
                              : null}
                            {item.amountWithoutTax !== null &&
                            item.taxAmount !== null
                              ? " · "
                              : null}
                            {item.taxAmount !== null
                              ? `IVA ${MXN.format(item.taxAmount)}`
                              : null}
                          </p>
                        ) : null}
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" />}
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Acciones</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdate ? (
                            <DropdownMenuItem onClick={() => openEdit(item)}>
                              <Pencil className="size-4" />
                              Editar
                            </DropdownMenuItem>
                          ) : null}
                          {canDelete ? (
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                              Eliminar
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <PayrollFormDialog
        mode={formMode}
        initial={formInitial}
        legalEntities={legalEntities}
        defaultYear={selectedYear}
        defaultMonth={selectedMonth ?? new Date().getUTCMonth() + 1}
        prefillEntityId={formPrefillEntity}
        onClose={() => {
          setFormMode(null);
          setFormInitial(null);
          setFormPrefillEntity(null);
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

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      {children}
    </div>
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
