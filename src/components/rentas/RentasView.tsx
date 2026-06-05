"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { actionGetContractRentHistory } from "@/lib/services/rentas";
import type { ContractHistoryEntry } from "@/lib/services/rentas-queries";
import type { RentTableRow, RentasTableData } from "@/lib/services/rentas-queries";
import { cn } from "@/lib/utils";
import { formatMXN } from "@/lib/format-currency";
import {
  formatDate,
  formatPeriodLong,
  formatPeriodShort,
} from "@/lib/format-date";

// ─── Formatters ───────────────────────────────────────────────────────────────

function toYYYYMM(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(isoDate: string): string {
  const d = new Date(isoDate);
  return toYYYYMM(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString());
}

function nextMonth(isoDate: string): string {
  const d = new Date(isoDate);
  return toYYYYMM(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString());
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PAID: {
    label: "Pagado",
    cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  PARTIAL: {
    label: "Parcial",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  PENDING: {
    label: "Pendiente",
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
  DUE: {
    label: "Vencida",
    cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  OVERDUE_1M: {
    label: "Vencida 1m",
    cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  OVERDUE_2M: {
    label: "Vencida 2m",
    cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  OVERDUE_3M: {
    label: "Vencida 3m",
    cls: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300 font-semibold",
  },
  WAIVED: {
    label: "Condonada",
    cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  NOT_GENERATED: {
    label: "Sin generar",
    cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, cls: STATUS_CFG.PENDING!.cls };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        cfg.cls,
      )}
    >
      {cfg.label}
    </span>
  );
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  DEPOSIT: "Depósito",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

// ─── Property summary type ────────────────────────────────────────────────────

interface PropertySummary {
  propertyId: string;
  propertyName: string;
  legalEntityCode: string;
  expected: number;
  collected: number;
  pct: number;
  unitCount: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  overdueCount: number;
  notGeneratedCount: number;
  accumulatedDebt: number;
}

type Tone = "positive" | "good" | "warning" | "danger" | "neutral";

function getCollectionTone(pct: number): Tone {
  if (pct >= 90) return "positive";
  if (pct >= 70) return "good";
  if (pct >= 50) return "warning";
  return "danger";
}

function toneTextClass(tone: Tone): string {
  if (tone === "positive") return "text-green-700 dark:text-green-400";
  if (tone === "good") return "text-blue-700 dark:text-blue-400";
  if (tone === "warning") return "text-amber-700 dark:text-amber-400";
  if (tone === "danger") return "text-red-700 dark:text-red-400";
  return "text-foreground";
}

function toneBarClass(tone: Tone): string {
  if (tone === "positive") return "bg-green-500";
  if (tone === "good") return "bg-blue-500";
  if (tone === "warning") return "bg-amber-500";
  if (tone === "danger") return "bg-red-500";
  return "bg-primary";
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RentasView({
  tableData,
  modeToggle,
}: {
  tableData: RentasTableData;
  modeToggle?: React.ReactNode;
}) {
  const router = useRouter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [histRow, setHistRow] = useState<RentTableRow | null>(null);
  const [history, setHistory] = useState<ContractHistoryEntry[] | null>(null);
  const [loadingHist, setLoadingHist] = useState(false);

  const period = new Date(tableData.period);

  function navigate(yyyyMM: string) {
    setSelectedPropertyId(null);
    router.push(`/collections?tab=rentas&periodo=${yyyyMM}`);
  }

  function prefetchPeriod(yyyyMM: string) {
    router.prefetch(`/collections?tab=rentas&periodo=${yyyyMM}`);
  }

  async function openHistory(row: RentTableRow) {
    setHistRow(row);
    setHistory(null);
    setLoadingHist(true);
    try {
      const data = await actionGetContractRentHistory(row.contractId);
      setHistory(data);
    } catch {
      toast.error("No se pudo cargar el historial.");
    } finally {
      setLoadingHist(false);
    }
  }

  // Group rows by property
  const propertySummaries = useMemo<PropertySummary[]>(() => {
    const map = new Map<string, PropertySummary>();
    for (const row of tableData.rows) {
      if (!map.has(row.propertyId)) {
        map.set(row.propertyId, {
          propertyId: row.propertyId,
          propertyName: row.propertyName,
          legalEntityCode: row.legalEntityCode,
          expected: 0,
          collected: 0,
          pct: 0,
          unitCount: 0,
          paidCount: 0,
          partialCount: 0,
          pendingCount: 0,
          overdueCount: 0,
          notGeneratedCount: 0,
          accumulatedDebt: 0,
        });
      }
      const s = map.get(row.propertyId)!;
      s.expected += row.amountDue;
      s.collected += row.amountPaid;
      s.unitCount += 1;
      s.accumulatedDebt += row.accumulatedDebt;
      if (row.status === "PAID") s.paidCount++;
      else if (row.status === "PARTIAL") s.partialCount++;
      else if (["PENDING", "DUE"].includes(row.status)) s.pendingCount++;
      else if (["OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"].includes(row.status)) s.overdueCount++;
      else if (row.status === "NOT_GENERATED") s.notGeneratedCount++;
    }
    return [...map.values()]
      .map((s) => ({
        ...s,
        pct: s.expected > 0 ? Math.round((s.collected / s.expected) * 100) : 0,
      }))
      .sort((a, b) => a.propertyName.localeCompare(b.propertyName));
  }, [tableData.rows]);

  const selectedRows = useMemo(
    () => tableData.rows.filter((r) => r.propertyId === selectedPropertyId),
    [tableData.rows, selectedPropertyId],
  );

  const selectedProperty = propertySummaries.find((p) => p.propertyId === selectedPropertyId);
  const activeUnitCount = selectedProperty
    ? selectedRows.filter((r) => r.status !== "NOT_GENERATED").length
    : tableData.rows.filter((r) => r.status !== "NOT_GENERATED").length;
  const expected = selectedProperty?.expected ?? tableData.kpis.expected;
  const collected = selectedProperty?.collected ?? tableData.kpis.collected;
  const pendingAmount = selectedProperty
    ? Math.max(0, selectedProperty.expected - selectedProperty.collected)
    : tableData.kpis.pending;
  const paidCount = selectedProperty?.paidCount ?? tableData.kpis.paidCount;
  const partialCount = selectedProperty?.partialCount ?? tableData.kpis.partialCount;
  const pendingCount = selectedProperty?.pendingCount ?? tableData.kpis.pendingCount;
  const overdueCount = selectedProperty?.overdueCount ?? tableData.kpis.overdueCount;
  const periodTone = getCollectionTone(selectedProperty?.pct ?? tableData.kpis.pct);
  const pctValue = selectedProperty?.pct ?? tableData.kpis.pct;

  return (
    <div className="space-y-6">
      <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="bg-muted/25 border-b px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-background gap-1.5">
                <CalendarDays className="size-3.5" />
                <span>{formatPeriodLong(period)}</span>
              </Badge>
              {selectedProperty ? (
                <Badge variant="outline" className="bg-background font-mono">
                  {selectedProperty.legalEntityCode}
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {modeToggle}
              {selectedPropertyId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-background gap-1.5"
                  onClick={() => setSelectedPropertyId(null)}
                >
                  <ArrowLeft className="size-4" />
                  Plazas
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="bg-background"
                    onClick={() => navigate(prevMonth(tableData.period))}
                    onMouseEnter={() => prefetchPeriod(prevMonth(tableData.period))}
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="bg-background"
                    onClick={() => navigate(nextMonth(tableData.period))}
                    onMouseEnter={() => prefetchPeriod(nextMonth(tableData.period))}
                    aria-label="Mes siguiente"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="max-w-2xl">
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              {selectedProperty?.propertyName ?? "Vista mensual"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Renta total
            </h2>
            <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
              {formatMXN(expected)}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              Pendiente {formatMXN(pendingAmount)}
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm font-medium">Progreso de cobranza</p>
              <p className="text-muted-foreground text-sm tabular-nums">
                <span className={toneTextClass(periodTone)}>{formatMXN(collected)}</span> /{" "}
                {formatMXN(expected)}
              </p>
            </div>
            <div className="bg-muted h-4 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full transition-all", toneBarClass(periodTone))}
                style={{ width: `${Math.min(pctValue, 100)}%` }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <DigestMetric label="Cobrado" value={formatMXN(collected)} tone="positive" />
              <DigestMetric
                label="Pendiente"
                value={formatMXN(pendingAmount)}
                tone={pendingAmount > 0 ? "warning" : "positive"}
              />
              <DigestMetric label="Avance" value={`${pctValue}%`} tone={periodTone} />
            </div>
            <div className="grid grid-cols-4 gap-2 pt-1 text-center text-xs">
              <StatusCount label="Pag." value={paidCount} tone="positive" />
              <StatusCount label="Parc." value={partialCount} tone="warning" />
              <StatusCount label="Pend." value={pendingCount} tone="neutral" />
              <StatusCount label="Venc." value={overdueCount} tone="danger" />
            </div>
          </div>
        </div>
      </section>

      {/* Content: cards or table */}
      {!selectedPropertyId ? (
        <PlazaCards summaries={propertySummaries} onSelect={setSelectedPropertyId} />
      ) : (
        <PropertyTable rows={selectedRows} onHistory={openHistory} />
      )}

      {/* History dialog */}
      <Dialog
        open={!!histRow}
        onOpenChange={(open) => {
          if (!open) {
            setHistRow(null);
            setHistory(null);
          }
        }}
      >
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="bg-muted flex size-8 items-center justify-center rounded-lg">
                <History className="size-4" />
              </span>
              Historial
              <span className="bg-muted rounded-md px-2 py-1 font-mono text-sm">
                {histRow?.unitCode}
              </span>
              <span className="text-muted-foreground font-normal">{histRow?.lesseeName}</span>
            </DialogTitle>
          </DialogHeader>
          {loadingHist ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            </div>
          ) : history && history.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No hay rentas registradas para este contrato.
            </p>
          ) : (
            <div className="space-y-3 pt-1">
              {(history ?? []).map((entry) => (
                <HistoryEntry key={entry.rentId} entry={entry} />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DigestMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="bg-background/70 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", toneTextClass(tone))}>{value}</p>
    </div>
  );
}

function StatusCount({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="bg-background/70 rounded-lg border px-2 py-2">
      <p className={cn("font-semibold tabular-nums", toneTextClass(tone))}>{value}</p>
      <p className="text-muted-foreground mt-0.5 truncate">{label}</p>
    </div>
  );
}

// ─── Plaza cards grid ─────────────────────────────────────────────────────────

function PlazaCards({
  summaries,
  onSelect,
}: {
  summaries: PropertySummary[];
  onSelect: (id: string) => void;
}) {
  if (summaries.length === 0) {
    return (
      <Card className="bg-card/60 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
            <Building2 className="text-muted-foreground size-5" />
          </div>
          <p className="mt-3 text-sm font-medium">No hay contratos activos</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Este período no tiene rentas disponibles.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Plazas</h3>
          <p className="text-muted-foreground text-xs">
            {summaries.length} plaza{summaries.length !== 1 ? "s" : ""} en el período.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summaries.map((s) => (
          <PlazaCard key={s.propertyId} summary={s} onClick={() => onSelect(s.propertyId)} />
        ))}
      </div>
    </section>
  );
}

function PlazaCard({ summary: s, onClick }: { summary: PropertySummary; onClick: () => void }) {
  const tone = getCollectionTone(s.pct);
  const pending = Math.max(0, s.expected - s.collected);
  const hasRisk = s.overdueCount > 0 || pending > 0;

  return (
    <button
      onClick={onClick}
      className="group focus-visible:ring-ring/50 w-full rounded-xl text-left transition-all outline-none focus-visible:ring-3"
    >
      <Card className="bg-card group-hover:border-primary/40 relative h-full border py-0 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <div className={cn("absolute inset-x-0 top-0 h-1", toneBarClass(tone))} />
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3 pt-1">
            <div className="flex min-w-0 items-start gap-3">
              <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Building2 className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base leading-tight font-semibold">{s.propertyName}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {s.unitCount} local{s.unitCount !== 1 ? "es" : ""} activos
                </p>
              </div>
            </div>
            <span className="bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors">
              <ArrowUpRight className="size-3.5" />
            </span>
          </div>

          <div className="bg-muted/35 rounded-lg p-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs">Cobrado</p>
                <p className="text-2xl font-semibold tabular-nums">{formatMXN(s.collected)}</p>
              </div>
              <div className="text-right">
                <p className={cn("text-xl font-semibold tabular-nums", toneTextClass(tone))}>
                  {s.pct}%
                </p>
                <p className="text-muted-foreground text-xs">avance</p>
              </div>
            </div>
          </div>

          <div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full transition-all", toneBarClass(tone))}
                style={{ width: `${Math.min(s.pct, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{formatMXN(s.expected)} esperado</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  pending > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-green-700 dark:text-green-400",
                )}
              >
                {pending > 0 ? `${formatMXN(pending)} pendiente` : "Al corriente"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 border-t pt-3 text-xs">
            <SoftPill tone="positive">{s.paidCount} pag.</SoftPill>
            {s.partialCount > 0 ? <SoftPill tone="warning">{s.partialCount} parc.</SoftPill> : null}
            {s.pendingCount > 0 ? <SoftPill>{s.pendingCount} pend.</SoftPill> : null}
            {s.overdueCount > 0 ? <SoftPill tone="danger">{s.overdueCount} venc.</SoftPill> : null}
            {s.notGeneratedCount > 0 ? (
              <SoftPill tone="warning">{s.notGeneratedCount} sin gen.</SoftPill>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <Badge
              variant="outline"
              className={cn(
                "bg-background font-mono",
                hasRisk &&
                  "border-amber-200 text-amber-800 dark:border-amber-900 dark:text-amber-400",
              )}
            >
              {s.legalEntityCode}
            </Badge>
            {s.accumulatedDebt > 0 ? (
              <span className="font-medium text-red-700 dark:text-red-400">
                Adeudo {formatMXN(s.accumulatedDebt)}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin adeudo acumulado</span>
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function SoftPill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground inline-flex rounded-full px-2 py-1",
        tone === "positive" &&
          "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        tone === "warning" &&
          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
        tone === "danger" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      )}
    >
      {children}
    </span>
  );
}

// ─── Property table ───────────────────────────────────────────────────────────

function PropertyTable({
  rows,
  onHistory,
}: {
  rows: RentTableRow[];
  onHistory: (row: RentTableRow) => void;
}) {
  const expected = rows.reduce((sum, row) => sum + row.amountDue, 0);
  const collected = rows.reduce((sum, row) => sum + row.amountPaid, 0);
  const pending = rows.reduce((sum, row) => sum + row.amountPending, 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Locales</h3>
          <p className="text-muted-foreground text-xs">
            {rows.length} locales, {formatMXN(collected)} cobrado de {formatMXN(expected)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SoftPill tone="positive">Cobrado {formatMXN(collected)}</SoftPill>
          <SoftPill tone={pending > 0 ? "warning" : "positive"}>
            Pendiente {formatMXN(pending)}
          </SoftPill>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="bg-card/60 border-dashed">
          <CardContent className="text-muted-foreground py-14 text-center text-sm">
            No hay locales para esta plaza en el periodo seleccionado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <UnitCard key={row.contractId} row={row} onHistory={() => onHistory(row)} />
          ))}
        </div>
      )}
    </section>
  );
}

function UnitCard({ row, onHistory }: { row: RentTableRow; onHistory: () => void }) {
  const isOverdue = ["OVERDUE_1M", "OVERDUE_2M", "OVERDUE_3M"].includes(row.status);
  const rowTone = row.amountPending > 0 ? (isOverdue ? "danger" : "warning") : "positive";

  return (
    <Card
      className={cn(
        "py-0",
        isOverdue && "border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10",
      )}
    >
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", toneBarClass(rowTone))} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-muted rounded-md px-2 py-1 font-mono text-xs font-medium">
                {row.unitCode}
              </span>
              <StatusBadge status={row.status} />
            </div>
            <p className="mt-2 truncate text-sm font-medium">{row.lesseeName}</p>
            {row.unitName ? (
              <p className="text-muted-foreground mt-0.5 truncate text-xs">{row.unitName}</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <AmountBlock label="Renta" value={formatMXN(row.monthlyAmount)} />
          <AmountBlock
            label="Pagado"
            value={row.amountPaid > 0 ? formatMXN(row.amountPaid) : "$0"}
            tone="positive"
          />
          <AmountBlock
            label="Pendiente"
            value={row.amountPending > 0 ? formatMXN(row.amountPending) : "$0"}
            tone={row.amountPending > 0 ? rowTone : "neutral"}
          />
        </div>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          {row.accumulatedDebt > 0 ? (
            <span className="text-xs font-medium text-red-700 dark:text-red-400">
              Adeudo acum. {formatMXN(row.accumulatedDebt)}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">Sin adeudo acum.</span>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            className="bg-background"
            onClick={onHistory}
            aria-label={`Ver historial de ${row.unitCode}`}
          >
            <History className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AmountBlock({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="bg-muted/45 rounded-lg px-3 py-2">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className={cn("mt-0.5 truncate font-semibold tabular-nums", toneTextClass(tone))}>
        {value}
      </p>
    </div>
  );
}

// ─── History entry ────────────────────────────────────────────────────────────

function HistoryEntry({ entry }: { entry: ContractHistoryEntry }) {
  const period = new Date(entry.period);
  const isPaid = entry.status === "PAID";

  return (
    <div className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold">{formatPeriodShort(period)}</span>
          <StatusBadge status={entry.status} />
        </div>
        <div className="text-right text-sm tabular-nums">
          <span
            className={cn(isPaid ? "text-green-700 dark:text-green-400" : "text-muted-foreground")}
          >
            {formatMXN(entry.amountPaid)}
          </span>
          <span className="text-muted-foreground"> / {formatMXN(entry.amountDue)}</span>
        </div>
      </div>

      {entry.payments.length > 0 && (
        <div className="space-y-1.5">
          {entry.payments.map((p) => (
            <div
              key={p.id}
              className="bg-muted/40 flex flex-col gap-1 rounded-md px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="text-muted-foreground flex flex-wrap items-center gap-2">
                <span>{formatDate(new Date(p.paymentDate))}</span>
                <Separator orientation="vertical" className="h-3" />
                <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                {p.reference && (
                  <>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="font-mono">{p.reference}</span>
                  </>
                )}
              </div>
              <span className="font-medium text-green-700 tabular-nums dark:text-green-400">
                {formatMXN(p.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {entry.payments.length === 0 && entry.status !== "WAIVED" && (
        <p className="text-muted-foreground text-xs italic">Sin pagos registrados</p>
      )}

      {entry.notes && <p className="text-muted-foreground border-t pt-2 text-xs">{entry.notes}</p>}
    </div>
  );
}
