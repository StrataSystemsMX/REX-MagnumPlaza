"use client";

import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ReturnGuaranteeDialog } from "./ReturnGuaranteeDialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YearNavigator } from "@/components/shared/yearly-matrix/YearlyMatrixParts";
import type { GuaranteeStatus } from "@/generated/prisma/enums";
import type { GuaranteeRow } from "@/server/services/guarantees-queries";
import type { LegalEntityOption } from "@/server/services/properties-queries";
import { formatMXN } from "@/shared/format-currency";
import { formatDate } from "@/shared/format-date";
import { cn } from "@/shared/utils";
import { isPlaza } from "@/shared/i18n/unit-label";

type StatusFilter = "ALL" | GuaranteeStatus;

const STATUS_FILTER_ITEMS: Record<StatusFilter, string> = {
  ALL: "Todos",
  HELD: "En custodia",
  PARTIALLY_RETURNED: "Devolución parcial",
  RETURNED: "Devuelto",
};

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

function statusBadge(s: GuaranteeStatus) {
  switch (s) {
    case "HELD":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200">
          En custodia
        </Badge>
      );
    case "PARTIALLY_RETURNED":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
          Devolución parcial
        </Badge>
      );
    case "RETURNED":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">
          Devuelto
        </Badge>
      );
  }
}

interface Totals {
  total: number;
  held: number;
  heldCount: number;
  returned: number;
  returnedCount: number;
}

interface Props {
  guarantees: ReadonlyArray<GuaranteeRow>;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  totals: Totals;
  canManage: boolean;
  year: number;
  availableYears: ReadonlyArray<number>;
}

interface OwnerGroup {
  entityId: string;
  code: string;
  items: GuaranteeRow[];
  total: number;
  held: number;
  heldCount: number;
}

export function GuaranteesTable({
  guarantees,
  legalEntities,
  totals,
  canManage,
  year,
  availableYears,
}: Props) {
  const [ownerFilter, setOwnerFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return guarantees.filter((g) => {
      if (
        ownerFilter !== "ALL" &&
        g.contract.unit.property.ownerEntity.id !== ownerFilter
      )
        return false;
      if (statusFilter !== "ALL" && g.status !== statusFilter) return false;
      return true;
    });
  }, [guarantees, ownerFilter, statusFilter]);

  const groups = useMemo<OwnerGroup[]>(() => {
    const map = new Map<string, OwnerGroup>();
    for (const g of filtered) {
      const owner = g.contract.unit.property.ownerEntity;
      let grp = map.get(owner.id);
      if (!grp) {
        grp = {
          entityId: owner.id,
          code: owner.code,
          items: [],
          total: 0,
          held: 0,
          heldCount: 0,
        };
        map.set(owner.id, grp);
      }
      grp.items.push(g);
      grp.total += g.amount;
      if (g.status === "HELD" || g.status === "PARTIALLY_RETURNED") {
        grp.held += g.amount;
        grp.heldCount += 1;
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [filtered]);

  const ownerItems: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = { ALL: "Todas" };
    for (const e of legalEntities) m[e.id] = e.code;
    return m;
  }, [legalEntities]);

  function toggleGroup(entityId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }

  const totalCount = guarantees.length;
  const heldProgress =
    totals.total > 0 ? (totals.held / totals.total) * 100 : 0;

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="Año">
          <YearNavigator year={year} availableYears={availableYears} />
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
            <SelectTrigger className="w-48">
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

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={<Wallet className="size-4" />}
          label="Total registrado"
          value={formatMXN(totals.total)}
          sub={`${totalCount} fianza${totalCount === 1 ? "" : "s"} históricas`}
        />
        <KpiCard
          icon={<ShieldAlert className="size-4" />}
          label="En custodia"
          value={formatMXN(totals.held)}
          sub={`${totals.heldCount} de ${totalCount} · ${heldProgress.toFixed(0)}%`}
          valueClass="text-amber-700 dark:text-amber-300"
          progress={heldProgress}
        />
        <KpiCard
          icon={<ShieldCheck className="size-4" />}
          label="Devueltos"
          value={formatMXN(totals.returned)}
          sub={
            totals.returnedCount > 0
              ? `${totals.returnedCount} depósito${totals.returnedCount === 1 ? "" : "s"}`
              : "Sin devoluciones"
          }
          valueClass="text-emerald-700 dark:text-emerald-300"
        />
      </div>

      {/* Owner sections */}
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card py-12 text-center">
          <Wallet className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {guarantees.length === 0
              ? canManage
                ? "Aún no hay fianzas registradas. Usa “Registrar fianza” para empezar."
                : "Aún no hay fianzas registradas."
              : "Sin fianzas que coincidan con los filtros."}
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
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Shared grid template — single source of truth for column widths across all
// owner sections. As long as every section renders rows of identical container
// width, the columns will land at the same X position on the page.
const GUARANTEE_GRID_COLS =
  "minmax(130px, 1.4fr) minmax(120px, 1.4fr) minmax(80px, 1fr) minmax(90px, 1fr) minmax(90px, 1fr) minmax(80px, 1.1fr) 200px";

function OwnerSection({
  group,
  expanded,
  onToggle,
  canManage,
}: {
  group: OwnerGroup;
  expanded: boolean;
  onToggle: () => void;
  canManage: boolean;
}) {
  const theme = themeFor(group.code);
  const count = group.items.length;
  const heldShare = group.total > 0 ? (group.held / group.total) * 100 : 0;

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
              {count} fianza{count === 1 ? "" : "s"}
            </span>
            <span className="text-xs text-muted-foreground">
              · {group.heldCount} en custodia
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", theme.bar)}
                style={{ width: `${Math.min(100, Math.max(0, heldShare))}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatMXN(group.held)} en custodia
            </span>
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total
          </div>
          <div className="font-mono text-sm font-semibold tabular-nums">
            {formatMXN(group.total)}
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
        <div className="overflow-x-auto">
        <div role="table" aria-label={`Fianzas ${group.code}`} className="min-w-[790px] border-t">
          <div
            role="row"
            className="grid items-center border-b bg-muted/30 text-xs font-medium uppercase text-muted-foreground"
            style={{ gridTemplateColumns: GUARANTEE_GRID_COLS }}
          >
            <div role="columnheader" className="px-3 py-2.5">
              Inquilino
            </div>
            <div role="columnheader" className="px-3 py-2.5">
              Local / Inmueble
            </div>
            <div role="columnheader" className="px-3 py-2.5 text-right">
              Depósito
            </div>
            <div role="columnheader" className="px-3 py-2.5 text-center">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                Recibido
              </span>
            </div>
            <div role="columnheader" className="px-3 py-2.5 text-right">
              Devuelto / Deducido
            </div>
            <div role="columnheader" className="px-3 py-2.5 text-center">
              Estado
            </div>
            <div role="columnheader" aria-label="Acciones" />
          </div>
          {group.items.map((g) => (
            <GuaranteeRow key={g.id} guarantee={g} canManage={canManage} />
          ))}
        </div>
        </div>
      ) : null}
    </div>
  );
}

function GuaranteeRow({
  guarantee,
  canManage,
}: {
  guarantee: GuaranteeRow;
  canManage: boolean;
}) {
  const isHeld = guarantee.status === "HELD";
  const hasReturn =
    guarantee.status === "PARTIALLY_RETURNED" || guarantee.status === "RETURNED";
  const canCloseOrEdit = isHeld || hasReturn;
  const totalDeducted =
    guarantee.deductions?.reduce((acc, d) => acc + d.amount, 0) ?? 0;

  return (
    <div
      role="row"
      className="grid items-center border-b text-sm transition-colors last:border-b-0 hover:bg-muted/50"
      style={{ gridTemplateColumns: GUARANTEE_GRID_COLS }}
    >
      <div role="cell" className="truncate px-3 py-2.5 font-medium">
        <Link
          href={`/lessees/${guarantee.contract.lessee.id}`}
          className="hover:underline"
        >
          {guarantee.contract.lessee.legalName}
        </Link>
      </div>
      <div role="cell" className="truncate px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">
          {guarantee.contract.unit.property.name}
        </span>
        {isPlaza(guarantee.contract.unit.property.type) ? (
          <span className="ml-1 font-medium">{guarantee.contract.unit.code}</span>
        ) : null}
      </div>
      <div
        role="cell"
        className="px-3 py-2.5 text-right font-mono font-medium tabular-nums"
      >
        {formatMXN(guarantee.amount, 2)}
      </div>
      <div
        role="cell"
        className="px-3 py-2.5 text-center text-xs text-muted-foreground"
      >
        {formatDate(guarantee.receivedDate)}
      </div>
      <div
        role="cell"
        className="px-3 py-2.5 text-right font-mono text-sm tabular-nums"
      >
        {guarantee.returnedAmount !== null ? (
          <span className="text-emerald-700 dark:text-emerald-300">
            {formatMXN(guarantee.returnedAmount, 2)}
          </span>
        ) : totalDeducted > 0 ? (
          <span className="text-destructive">
            -{formatMXN(totalDeducted, 2)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div role="cell" className="overflow-hidden flex justify-center px-3 py-2.5">
        {statusBadge(guarantee.status)}
      </div>
      <div role="cell" className="flex items-center justify-end gap-1.5 pr-2">
        <Link
          href={`/contracts/${guarantee.contractId}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Ver contrato"
          aria-label="Ver contrato"
        >
          <ExternalLink className="size-4" />
        </Link>
        {canManage && canCloseOrEdit ? (
          <ReturnGuaranteeDialog
            guaranteeId={guarantee.id}
            totalAmount={guarantee.amount}
            lesseeName={guarantee.contract.lessee.legalName}
            initial={
              hasReturn
                ? {
                    returnedAmount: guarantee.returnedAmount,
                    returnedDate: guarantee.returnedDate,
                    deductions:
                      guarantee.deductions?.map((d) => ({
                        concept: d.concept,
                        amount: d.amount,
                      })) ?? [],
                    notes: guarantee.notes,
                  }
                : null
            }
          />
        ) : null}
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
            className="h-full rounded-full bg-amber-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
