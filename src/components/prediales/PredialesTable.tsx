"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  FileText,
  Hourglass,
  Landmark,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
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
import { PredialFormDialog } from "@/components/prediales/PredialFormDialog";
import { PredialReceiptsDialog } from "@/components/prediales/PredialReceiptsDialog";
import { PredialRegisterPaymentDialog } from "@/components/prediales/PredialRegisterPaymentDialog";
import {
  actionDeleteCadastralPayment,
  actionUnmarkCadastralPayment,
} from "@/lib/services/cadastral";
import type {
  CadastralListItem,
  CadastralPropertyOption,
  CadastralStatus,
} from "@/lib/services/cadastral-queries";
import type { LegalEntityOption } from "@/lib/services/properties-queries";
import { capitalizeFirst, cn } from "@/lib/utils";

type StatusFilter = "ALL" | CadastralStatus;

const STATUS_FILTER_ITEMS: Record<StatusFilter, string> = {
  ALL: "Todos",
  DUE: "Pendiente",
  OVERDUE: "Vencido",
  PAID: "Pagado",
  PAID_BY_THIRD_PARTY: "Paga tercero",
};

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

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

const ENTITY_THEME: Record<
  string,
  { dot: string; ring: string; badge: string; bar: string; soft: string }
> = {
  CRT: {
    dot: "bg-orange-500",
    ring: "ring-orange-200 dark:ring-orange-900/50",
    badge:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    bar: "bg-orange-500",
    soft: "bg-orange-50/40 dark:bg-orange-950/20",
  },
  TSR: {
    dot: "bg-blue-500",
    ring: "ring-blue-200 dark:ring-blue-900/50",
    badge:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    bar: "bg-blue-500",
    soft: "bg-blue-50/40 dark:bg-blue-950/20",
  },
  QHS: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-200 dark:ring-emerald-900/50",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    bar: "bg-emerald-500",
    soft: "bg-emerald-50/40 dark:bg-emerald-950/20",
  },
  JCL: {
    dot: "bg-violet-500",
    ring: "ring-violet-200 dark:ring-violet-900/50",
    badge:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    bar: "bg-violet-500",
    soft: "bg-violet-50/40 dark:bg-violet-950/20",
  },
};
const DEFAULT_THEME = {
  dot: "bg-slate-500",
  ring: "ring-slate-200 dark:ring-slate-800",
  badge:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  bar: "bg-slate-500",
  soft: "bg-slate-50/40 dark:bg-slate-950/20",
};
function themeFor(code: string) {
  return ENTITY_THEME[code] ?? DEFAULT_THEME;
}

function statusBadge(s: CadastralStatus) {
  switch (s) {
    case "PAID":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">
          Pagado
        </Badge>
      );
    case "DUE":
      return <Badge variant="secondary">Pendiente</Badge>;
    case "OVERDUE":
      return <Badge variant="destructive">Vencido</Badge>;
    case "PAID_BY_THIRD_PARTY":
      return (
        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200">
          Paga tercero
        </Badge>
      );
  }
}

interface Totals {
  total: number;
  paid: number;
  pending: number;
  thirdParty: number;
}

interface Props {
  payments: ReadonlyArray<CadastralListItem>;
  properties: ReadonlyArray<CadastralPropertyOption>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  yearsAvailable: ReadonlyArray<number>;
  selectedYear: number;
  totals: Totals;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

interface OwnerGroup {
  entityId: string;
  code: string;
  items: CadastralListItem[];
  total: number;
  paid: number;
  paidCount: number;
}

export function PredialesTable({
  payments,
  properties,
  legalEntities,
  yearsAvailable,
  selectedYear,
  totals,
  canCreate,
  canUpdate,
  canDelete,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [ownerFilter, setOwnerFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Dialog states
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formInitial, setFormInitial] = useState<CadastralListItem | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<CadastralListItem | null>(
    null,
  );
  const [receiptsTarget, setReceiptsTarget] =
    useState<CadastralListItem | null>(null);
  const [unmarkTarget, setUnmarkTarget] = useState<CadastralListItem | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<CadastralListItem | null>(
    null,
  );

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (ownerFilter !== "ALL" && p.ownerEntity.id !== ownerFilter)
        return false;
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      return true;
    });
  }, [payments, ownerFilter, statusFilter]);

  const groups = useMemo<OwnerGroup[]>(() => {
    const map = new Map<string, OwnerGroup>();
    for (const p of filtered) {
      const key = p.ownerEntity.id;
      let g = map.get(key);
      if (!g) {
        g = {
          entityId: key,
          code: p.ownerEntity.code,
          items: [],
          total: 0,
          paid: 0,
          paidCount: 0,
        };
        map.set(key, g);
      }
      g.items.push(p);
      const amt = p.totalAmount ?? 0;
      g.total += amt;
      if (p.isPaid) {
        g.paid += amt;
        g.paidCount += 1;
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [filtered]);

  const yearItems: Record<string, string> = useMemo(
    () =>
      Object.fromEntries(yearsAvailable.map((y) => [String(y), String(y)])),
    [yearsAvailable],
  );

  const ownerItems: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = { ALL: "Todas" };
    for (const e of legalEntities) map[e.id] = e.code;
    return map;
  }, [legalEntities]);

  function setYearParam(y: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", y);
    router.push(`/prediales?${params.toString()}`);
  }

  function payerLabel(p: CadastralListItem): string {
    if (p.payerEntity) return p.payerEntity.code;
    if (p.paidByThirdPartyName) return p.paidByThirdPartyName;
    return p.ownerEntity.code;
  }

  function toggleGroup(entityId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }

  function confirmUnmark() {
    if (!unmarkTarget) return;
    const target = unmarkTarget;
    startTransition(async () => {
      try {
        await actionUnmarkCadastralPayment({ id: target.id });
        toast.success("Pago desmarcado.");
        setUnmarkTarget(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error.");
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        await actionDeleteCadastralPayment({ id: target.id });
        toast.success("Predial eliminado.");
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al eliminar.");
      }
    });
  }

  const totalCount = payments.length;
  const paidCount = payments.filter((p) => p.isPaid).length;
  const globalProgress =
    totals.total > 0 ? (totals.paid / totals.total) * 100 : 0;

  return (
    <>
      {/* Filters + create */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Año">
            <Select
              value={String(selectedYear)}
              onValueChange={(v) => v && setYearParam(v)}
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
          <FilterField label="Dueña">
            <Select
              value={ownerFilter}
              onValueChange={(v) => v && setOwnerFilter(v)}
              items={ownerItems}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ownerItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Estado">
            <Select
              value={statusFilter}
              onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
              items={STATUS_FILTER_ITEMS}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_FILTER_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>
        {canCreate ? (
          <Button
            onClick={() => {
              setFormInitial(null);
              setFormMode("create");
            }}
          >
            <Plus className="size-4" />
            Nuevo predial
          </Button>
        ) : null}
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Landmark className="size-4" />}
          label="Total registrado"
          value={MXN_INT.format(totals.total)}
          sub={`${totalCount} predial${totalCount === 1 ? "" : "es"} · ${selectedYear}`}
        />
        <KpiCard
          icon={<CheckCircle2 className="size-4" />}
          label="Pagado"
          value={MXN_INT.format(totals.paid)}
          sub={`${paidCount} de ${totalCount} · ${globalProgress.toFixed(0)}%`}
          valueClass="text-emerald-700 dark:text-emerald-300"
          progress={globalProgress}
        />
        <KpiCard
          icon={<Hourglass className="size-4" />}
          label="Pendiente"
          value={MXN_INT.format(totals.pending)}
          sub="Por liquidar este año"
          valueClass="text-amber-700 dark:text-amber-300"
        />
        <KpiCard
          icon={<Users className="size-4" />}
          label="Paga tercero"
          value={MXN_INT.format(totals.thirdParty)}
          sub="Cubierto por terceros"
          valueClass="text-rose-700 dark:text-rose-300"
        />
      </div>

      {/* Owner sections (3 tarjetas; CSS Grid compartido garantiza alineación) */}
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card py-12 text-center">
          <CircleDollarSign className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            Sin prediales que coincidan con los filtros.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <OwnerSection
              key={g.entityId}
              group={g}
              expanded={!collapsed.has(g.entityId)}
              onToggle={() => toggleGroup(g.entityId)}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onPay={(p) => setPaymentTarget(p)}
              onUnmark={(p) => setUnmarkTarget(p)}
              onReceipts={(p) => setReceiptsTarget(p)}
              onEdit={(p) => {
                setFormInitial(p);
                setFormMode("edit");
              }}
              onDelete={(p) => setDeleteTarget(p)}
              payerLabel={payerLabel}
            />
          ))}
        </div>
      )}

      <PredialFormDialog
        mode={formMode}
        initial={formInitial}
        properties={properties}
        legalEntities={legalEntities}
        defaultYear={selectedYear}
        onClose={() => {
          setFormMode(null);
          setFormInitial(null);
        }}
      />

      <PredialRegisterPaymentDialog
        target={paymentTarget}
        onClose={() => setPaymentTarget(null)}
      />

      <PredialReceiptsDialog
        target={receiptsTarget}
        canEdit={canUpdate}
        onClose={() => setReceiptsTarget(null)}
      />

      <AlertDialog
        open={unmarkTarget !== null}
        onOpenChange={(o) => !o && !pending && setUnmarkTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desmarcar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              El predial volverá a estado pendiente y se borrarán el monto
              pagado y la fecha registrados. Las boletas adjuntas no se
              eliminan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmUnmark();
              }}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Desmarcar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !pending && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar predial?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará el registro {deleteTarget?.year} de{" "}
              {deleteTarget?.propertyName}. Las boletas adjuntas también se
              eliminarán. Esta acción no se puede deshacer.
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

// Shared grid template — single source of truth for column widths across all
// owner sections. As long as every section renders rows of identical container
// width, the columns will land at the same X position on the page.
const PREDIAL_GRID_COLS =
  "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 0.85fr) 40px";

interface RowHandlers {
  canUpdate: boolean;
  canDelete: boolean;
  onPay: (p: CadastralListItem) => void;
  onUnmark: (p: CadastralListItem) => void;
  onReceipts: (p: CadastralListItem) => void;
  onEdit: (p: CadastralListItem) => void;
  onDelete: (p: CadastralListItem) => void;
  payerLabel: (p: CadastralListItem) => string;
}

function OwnerSection({
  group,
  expanded,
  onToggle,
  ...handlers
}: {
  group: OwnerGroup;
  expanded: boolean;
  onToggle: () => void;
} & RowHandlers) {
  const theme = themeFor(group.code);
  const count = group.items.length;
  const progress = group.total > 0 ? (group.paid / group.total) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30",
          theme.soft,
        )}
      >
        <span
          className={cn("size-2.5 shrink-0 rounded-full", theme.dot)}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{group.code}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                theme.badge,
              )}
            >
              {count} inmueble{count === 1 ? "" : "s"}
            </span>
            <span className="text-xs text-muted-foreground">
              · {group.paidCount} de {count} pagado{count === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", theme.bar)}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {progress.toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total
          </div>
          <div className="font-mono text-sm font-semibold tabular-nums">
            {MXN_INT.format(group.total)}
          </div>
        </div>
        <div className="shrink-0 rounded p-1 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </div>
      </button>

      {expanded ? (
        <div
          role="table"
          aria-label={`Prediales ${group.code}`}
          className="border-t"
        >
          <div
            role="row"
            className="grid items-center border-b bg-muted/30 text-xs font-medium uppercase text-muted-foreground"
            style={{ gridTemplateColumns: PREDIAL_GRID_COLS }}
          >
            <div role="columnheader" className="px-3 py-2.5">
              Inmueble
            </div>
            <div role="columnheader" className="px-3 py-2.5">
              Clave catastral
            </div>
            <div role="columnheader" className="px-3 py-2.5">
              Pagador
            </div>
            <div role="columnheader" className="px-3 py-2.5 text-right">
              Monto
            </div>
            <div role="columnheader" className="px-3 py-2.5 text-center">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                Fecha de pago
              </span>
            </div>
            <div role="columnheader" className="px-3 py-2.5 text-center">
              Estado
            </div>
            <div role="columnheader" aria-label="Acciones" />
          </div>
          {group.items.map((p) => (
            <PredialRow key={p.id} payment={p} {...handlers} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PredialRow({
  payment,
  canUpdate,
  canDelete,
  onPay,
  onUnmark,
  onReceipts,
  onEdit,
  onDelete,
  payerLabel,
}: { payment: CadastralListItem } & RowHandlers) {
  return (
    <div
      role="row"
      className="grid items-center border-b text-sm transition-colors last:border-b-0 hover:bg-muted/50"
      style={{ gridTemplateColumns: PREDIAL_GRID_COLS }}
    >
      <div role="cell" className="truncate px-3 py-2.5 font-medium">
        {payment.propertyName}
      </div>
      <div role="cell" className="truncate px-3 py-2.5 font-mono text-xs">
        {payment.cadastralKey ?? "—"}
      </div>
      <div role="cell" className="truncate px-3 py-2.5">
        {payerLabel(payment)}
      </div>
      <div
        role="cell"
        className="px-3 py-2.5 text-right font-mono tabular-nums"
      >
        {payment.totalAmount !== null ? MXN.format(payment.totalAmount) : "—"}
      </div>
      <div
        role="cell"
        className="px-3 py-2.5 text-center text-xs text-muted-foreground"
      >
        {payment.paymentDate
          ? capitalizeFirst(DATE.format(payment.paymentDate))
          : "—"}
      </div>
      <div role="cell" className="flex justify-center px-3 py-2.5">
        {statusBadge(payment.status)}
      </div>
      <div role="cell" className="flex justify-end pr-1">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Acciones</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canUpdate && !payment.isPaid ? (
              <DropdownMenuItem onClick={() => onPay(payment)}>
                <CheckCircle2 className="size-4" />
                Registrar pago
              </DropdownMenuItem>
            ) : null}
            {canUpdate && payment.isPaid ? (
              <DropdownMenuItem onClick={() => onUnmark(payment)}>
                <RotateCcw className="size-4" />
                Desmarcar pago
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => onReceipts(payment)}>
              <FileText className="size-4" />
              Boletas
            </DropdownMenuItem>
            {canUpdate ? (
              <DropdownMenuItem onClick={() => onEdit(payment)}>
                <Pencil className="size-4" />
                Editar
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem onClick={() => onDelete(payment)}>
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

function KpiCard({
  icon,
  label,
  value,
  sub,
  progress,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  progress?: number;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums leading-none",
          valueClass,
        )}
      >
        {value}
      </p>
      {typeof progress === "number" ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
