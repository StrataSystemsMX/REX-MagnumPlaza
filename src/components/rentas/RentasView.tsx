"use client";

import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CircleAlert,
  FileText,
  Loader2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionGenerateMissingRents } from "@/lib/services/rentas";
import type {
  PeriodSummary,
  RentasOverview,
} from "@/lib/services/rentas-queries";
import { cn } from "@/lib/utils";

const MXN_FULL = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const MXN_COMPACT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
  notation: "compact",
});

const MONTH = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_SHORT = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

interface RentasViewProps {
  overview: RentasOverview;
}

export function RentasView({ overview }: RentasViewProps) {
  const {
    currentPeriod,
    activeContracts,
    current,
    missingRentsCount,
    missingRentsContracts,
    projection,
    history,
    anomalies,
  } = overview;

  const currentDate = new Date(currentPeriod);
  const collectionPct = pct(current.amountPaid, current.amountDue);

  return (
    <div className="space-y-6">
      <KpiRow
        currentMonth={MONTH.format(currentDate)}
        activeContracts={activeContracts.count}
        expectedMonthly={activeContracts.expectedMonthly}
        rentsGenerated={current.rentsTotal}
        amountDue={current.amountDue}
        amountPaid={current.amountPaid}
        collectionPct={collectionPct}
        missingCount={missingRentsCount}
      />

      {missingRentsCount > 0 ? (
        <MissingRentsCard
          contracts={missingRentsContracts}
          period={currentDate}
        />
      ) : (
        <AllGoodCard period={currentDate} count={current.rentsTotal} />
      )}

      <ProjectionTable rows={projection} />

      <HistoryTable rows={history} />

      {anomalies.waivedCount > 0 || anomalies.withNotesCount > 0 ? (
        <AnomaliesCard anomalies={anomalies} />
      ) : null}
    </div>
  );
}

function KpiRow({
  currentMonth,
  activeContracts,
  expectedMonthly,
  rentsGenerated,
  amountDue,
  amountPaid,
  collectionPct,
  missingCount,
}: {
  currentMonth: string;
  activeContracts: number;
  expectedMonthly: number;
  rentsGenerated: number;
  amountDue: number;
  amountPaid: number;
  collectionPct: number;
  missingCount: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={<FileText className="size-4" />}
        label="Contratos activos"
        value={activeContracts.toString()}
        sublabel={`${MXN_FULL.format(expectedMonthly)} / mes esperado`}
      />
      <KpiCard
        icon={<Calendar className="size-4" />}
        label={`Rentas generadas — ${currentMonth}`}
        value={rentsGenerated.toString()}
        sublabel={
          missingCount > 0
            ? `${missingCount} contratos sin renta del mes`
            : "Todos los contratos cubiertos"
        }
        sublabelTone={missingCount > 0 ? "warning" : "ok"}
      />
      <KpiCard
        icon={<TrendingUp className="size-4" />}
        label="Facturado este mes"
        value={MXN_FULL.format(amountDue)}
        sublabel="Suma de rentas generadas"
      />
      <KpiCard
        icon={<Wallet className="size-4" />}
        label="Cobranza"
        value={`${collectionPct}%`}
        sublabel={`${MXN_FULL.format(amountPaid)} cobrado`}
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sublabel,
  sublabelTone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  sublabelTone?: "ok" | "warning";
}) {
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span className="line-clamp-1">{label}</span>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p
          className={cn(
            "text-xs",
            sublabelTone === "warning"
              ? "text-amber-700 dark:text-amber-400"
              : sublabelTone === "ok"
                ? "text-green-700 dark:text-green-400"
                : "text-muted-foreground",
          )}
        >
          {sublabel}
        </p>
      </CardContent>
    </Card>
  );
}

function MissingRentsCard({
  contracts,
  period,
}: {
  contracts: RentasOverview["missingRentsContracts"];
  period: Date;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      try {
        const result = await actionGenerateMissingRents();
        toast.success(
          `Se generaron ${result.rentsCreated} renta${result.rentsCreated === 1 ? "" : "s"} (${result.rentsSkipped} ya existían).`,
        );
        router.refresh();
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Error al generar rentas.";
        toast.error(msg);
      }
    });
  }

  return (
    <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-medium">
                {contracts.length} contrato{contracts.length === 1 ? "" : "s"}{" "}
                sin renta generada de {MONTH.format(period)}
              </p>
              <p className="text-sm text-muted-foreground">
                Esto suele indicar que el cron mensual no corrió o que se
                activaron contratos después del día 1.
              </p>
            </div>
          </div>
          <Button onClick={generate} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {pending ? "Generando..." : "Generar rentas faltantes"}
          </Button>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plaza / Local</TableHead>
                <TableHead>Inquilino</TableHead>
                <TableHead className="text-right">Monto mensual</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c.contractId}>
                  <TableCell className="text-sm">
                    {c.propertyName} ·{" "}
                    <span className="font-mono text-xs">{c.unitCode}</span>
                  </TableCell>
                  <TableCell className="text-sm">{c.lesseeName}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {MXN_FULL.format(c.monthlyAmount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      render={<Link href={`/contracts/${c.contractId}`} />}
                    >
                      Ver contrato
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function AllGoodCard({ period, count }: { period: Date; count: number }) {
  return (
    <Card className="border-green-300 bg-green-50/40 dark:border-green-900 dark:bg-green-950/20">
      <CardContent className="flex items-center gap-3 p-5">
        <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
        <div>
          <p className="font-medium">
            Todos los contratos activos tienen renta generada de{" "}
            {MONTH.format(period)}.
          </p>
          <p className="text-sm text-muted-foreground">
            {count} renta{count === 1 ? "" : "s"} en total.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectionTable({
  rows,
}: {
  rows: RentasOverview["projection"];
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <h2 className="text-sm font-semibold">Proyección · próximos 6 meses</h2>
          <p className="text-xs text-muted-foreground">
            Asume que los contratos vigentes se mantienen activos. No genera
            rentas todavía.
          </p>
        </div>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">
                  Contratos vigentes
                </TableHead>
                <TableHead className="text-right">
                  Monto esperado
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.period.toString()}>
                  <TableCell className="text-sm font-medium capitalize">
                    {MONTH.format(new Date(r.period))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.activeContracts}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-medium">
                    {MXN_FULL.format(r.expectedAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryTable({ rows }: { rows: PeriodSummary[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <h2 className="text-sm font-semibold">Histórico · últimos 6 meses</h2>
          <p className="text-xs text-muted-foreground">
            Comparativo de facturado vs cobrado por periodo.
          </p>
        </div>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Rentas</TableHead>
                <TableHead className="text-right">Facturado</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">% Cobranza</TableHead>
                <TableHead>Distribución</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const collectionPct = pct(r.amountPaid, r.amountDue);
                return (
                  <TableRow key={r.period.toString()}>
                    <TableCell className="text-sm font-medium capitalize">
                      {MONTH_SHORT.format(new Date(r.period))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {r.rentsTotal}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {MXN_COMPACT.format(r.amountDue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {MXN_COMPACT.format(r.amountPaid)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums text-sm font-medium",
                        collectionPct === 100 && "text-green-700 dark:text-green-400",
                        collectionPct < 70 && r.rentsTotal > 0 && "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {r.rentsTotal > 0 ? `${collectionPct}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <DistributionBar summary={r} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function DistributionBar({ summary }: { summary: PeriodSummary }) {
  const total = summary.rentsTotal;
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;

  const segments = [
    { count: summary.rentsPaid, color: "bg-green-500", label: "Pagadas" },
    { count: summary.rentsPartial, color: "bg-amber-500", label: "Parciales" },
    { count: summary.rentsPending, color: "bg-muted-foreground/40", label: "Pendientes" },
    { count: summary.rentsOverdue, color: "bg-red-500", label: "Vencidas" },
    { count: summary.rentsWaived, color: "bg-blue-500", label: "Condonadas" },
  ].filter((s) => s.count > 0);

  return (
    <div
      className="flex h-2 w-32 overflow-hidden rounded-full"
      title={segments.map((s) => `${s.label}: ${s.count}`).join(" · ")}
    >
      {segments.map((s, i) => (
        <div
          key={i}
          className={s.color}
          style={{ width: `${(s.count / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

function AnomaliesCard({
  anomalies,
}: {
  anomalies: RentasOverview["anomalies"];
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-2">
          <CircleAlert className="size-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-semibold">Anomalías · últimos 12 meses</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {anomalies.waivedCount > 0 ? (
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">Rentas condonadas</p>
              <p className="text-lg font-semibold tabular-nums">
                {anomalies.waivedCount}
              </p>
              <p className="text-xs text-muted-foreground">
                {MXN_FULL.format(anomalies.waivedAmount)} no facturados
              </p>
            </div>
          ) : null}
          {anomalies.withNotesCount > 0 ? (
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">
                Rentas con notas/ajustes
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {anomalies.withNotesCount}
              </p>
              <p className="text-xs text-muted-foreground">
                Tienen notas adjuntas (descuentos, prorrateos, etc.)
              </p>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
