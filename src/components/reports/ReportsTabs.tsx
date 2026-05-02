"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  contractStatusLabel,
  contractTypeLabel,
  propertyTypeLabel,
  unitStatusLabel,
} from "@/lib/i18n/enums";
import type {
  ContractStatus,
  PropertyType,
  UnitStatus,
} from "@/generated/prisma/enums";
import type { ReportsBundle } from "@/lib/services/reports-queries";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function money(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "—";
  return MXN.format(n);
}

function moneyZero(v: string | number): string {
  const n = Number(v);
  return MXN.format(Number.isFinite(n) ? n : 0);
}

interface ReportsTabsProps {
  bundle: ReportsBundle;
}

export function ReportsTabs({ bundle }: ReportsTabsProps) {
  return (
    <Tabs defaultValue="aging" className="w-full">
      <TabsList>
        <TabsTrigger value="aging">Cartera vencida</TabsTrigger>
        <TabsTrigger value="occupancy">Ocupación</TabsTrigger>
        <TabsTrigger value="income">Ingresos por inmueble</TabsTrigger>
        <TabsTrigger value="expenses">Egresos por categoría</TabsTrigger>
        <TabsTrigger value="contracts">Contratos</TabsTrigger>
      </TabsList>

      <TabsContent value="aging" className="mt-4">
        <AgingTab data={bundle.aging} />
      </TabsContent>

      <TabsContent value="occupancy" className="mt-4">
        <OccupancyTab data={bundle.occupancy} />
      </TabsContent>

      <TabsContent value="income" className="mt-4">
        <IncomeByPropertyTab data={bundle.incomeByProperty} />
      </TabsContent>

      <TabsContent value="expenses" className="mt-4">
        <ExpensesByCategoryTab data={bundle.expensesByCategory} />
      </TabsContent>

      <TabsContent value="contracts" className="mt-4">
        <ContractsTab data={bundle.contracts} />
      </TabsContent>
    </Tabs>
  );
}

// ============================================================================
// Tab 1 — Cartera vencida (Aging)
// ============================================================================

function AgingTab({ data }: { data: ReportsBundle["aging"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <BucketCard label="0 – 30 días" value={data.totals.bucket0to30} tone="default" />
        <BucketCard label="31 – 60 días" value={data.totals.bucket31to60} tone="warning" />
        <BucketCard label="61 – 90 días" value={data.totals.bucket61to90} tone="warning" />
        <BucketCard label="Más de 90 días" value={data.totals.bucket90plus} tone="danger" />
        <BucketCard label="Total" value={data.totals.total} tone="emphasis" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adeudo por inquilino</CardTitle>
          <CardDescription>
            Distribución del saldo pendiente según antigüedad. Corte al{" "}
            {DATE.format(data.asOf)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState message="¡Sin cartera vencida!" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inquilino</TableHead>
                  <TableHead className="text-right">0-30</TableHead>
                  <TableHead className="text-right">31-60</TableHead>
                  <TableHead className="text-right">61-90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Días máx</TableHead>
                  <TableHead className="text-right">Rentas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.lesseeId}>
                    <TableCell>
                      <Link
                        href={`/lessees/${row.lesseeId}`}
                        className="font-medium hover:underline"
                      >
                        {row.legalName}
                      </Link>
                      {row.contactName ? (
                        <p className="text-xs text-muted-foreground">
                          {row.contactName}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.bucket0to30)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.bucket31to60)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.bucket61to90)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-rose-600">
                      {money(row.bucket90plus)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {moneyZero(row.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={row.oldestDaysOverdue > 90 ? "destructive" : "secondary"}>
                        {row.oldestDaysOverdue}d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{row.rentsOverdueCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BucketCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "warning" | "danger" | "emphasis";
}) {
  const cls =
    tone === "danger"
      ? "text-rose-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "emphasis"
          ? "text-foreground"
          : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription className="text-xs uppercase tracking-wide">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold tabular-nums ${cls}`}>
          {moneyZero(value)}
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab 2 — Ocupación
// ============================================================================

function OccupancyTab({ data }: { data: ReportsBundle["occupancy"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SimpleStat
          label="Unidades totales"
          value={String(data.totals.totalUnits)}
        />
        <SimpleStat
          label="Ocupación"
          value={`${Math.round(data.totals.occupancyRate * 100)}%`}
          subValue={`${data.totals.rentedUnits} rentadas · ${data.totals.availableUnits} disponibles`}
        />
        <SimpleStat
          label="Renta contratada / mes"
          value={moneyZero(data.totals.contractedMonthlyIncome)}
        />
        <SimpleStat
          label="Ingreso potencial perdido"
          value={moneyZero(data.totals.potentialLostIncome)}
          tone="warning"
          subValue="Estimado mensual de unidades disponibles"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por inmueble</CardTitle>
          <CardDescription>
            Ocupación, renta contratada e ingreso potencial perdido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <EmptyState message="Aún no hay inmuebles activos." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inmueble</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Rentadas</TableHead>
                  <TableHead className="text-right">Disponibles</TableHead>
                  <TableHead className="text-right">Ocupación</TableHead>
                  <TableHead className="text-right">Renta / mes</TableHead>
                  <TableHead className="text-right">Pérdida potencial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.propertyId}>
                    <TableCell>
                      <Link
                        href={`/properties/${row.propertyId}`}
                        className="font-medium hover:underline"
                      >
                        {row.propertyName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {propertyTypeLabel(row.type as PropertyType)}
                    </TableCell>
                    <TableCell className="text-right">{row.totalUnits}</TableCell>
                    <TableCell className="text-right">{row.rentedUnits}</TableCell>
                    <TableCell className="text-right">{row.availableUnits}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          row.occupancyRate >= 0.8
                            ? "default"
                            : row.occupancyRate >= 0.5
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {Math.round(row.occupancyRate * 100)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.contractedMonthlyIncome)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">
                      {money(row.potentialLostIncome)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unidades disponibles</CardTitle>
          <CardDescription>
            Locales sin contrato activo, listos para rentar o promocionar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.vacantUnits.length === 0 ? (
            <EmptyState message="Todas las unidades están ocupadas." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inmueble</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Renta estimada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.vacantUnits.map((u) => (
                  <TableRow key={u.unitId}>
                    <TableCell>
                      <Link
                        href={`/properties/${u.propertyId}`}
                        className="font-medium hover:underline"
                      >
                        {u.propertyName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {u.unitCode}
                      {u.unitName ? (
                        <span className="text-xs text-muted-foreground"> · {u.unitName}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {unitStatusLabel(u.status as UnitStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.estimatedRent ? money(u.estimatedRent) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Tab 3 — Ingresos por inmueble
// ============================================================================

function IncomeByPropertyTab({
  data,
}: {
  data: ReportsBundle["incomeByProperty"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingreso cobrado por inmueble — {data.year}</CardTitle>
        <CardDescription>
          Suma de pagos recibidos en cada mes, asignada al inmueble del local rentado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.rows.length === 0 ? (
          <EmptyState message="Sin inmuebles registrados." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">Inmueble</TableHead>
                  {MONTH_NAMES.map((m) => (
                    <TableHead key={m} className="text-right">
                      {m}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.propertyId}>
                    <TableCell className="sticky left-0 bg-background">
                      <Link
                        href={`/properties/${row.propertyId}`}
                        className="font-medium hover:underline"
                      >
                        {row.propertyName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {propertyTypeLabel(row.type as PropertyType)}
                      </p>
                    </TableCell>
                    {row.monthly.map((v, i) => (
                      <TableCell key={i} className="text-right tabular-nums">
                        {money(v)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {moneyZero(row.total)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30">
                  <TableCell className="sticky left-0 bg-muted/30 font-medium">
                    Total
                  </TableCell>
                  {data.monthlyTotals.map((v, i) => (
                    <TableCell
                      key={i}
                      className="text-right font-semibold tabular-nums"
                    >
                      {money(v)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-bold tabular-nums">
                    {moneyZero(data.grandTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab 4 — Egresos por categoría
// ============================================================================

function ExpensesByCategoryTab({
  data,
}: {
  data: ReportsBundle["expensesByCategory"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Egresos por categoría — {data.year}</CardTitle>
        <CardDescription>
          Acumulado del año por categoría, con desglose por entidad legal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.rows.length === 0 ? (
          <EmptyState message="Sin egresos registrados este año." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                {data.legalEntityCodes.map((code) => (
                  <TableHead key={code} className="text-right">
                    {code}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.categoryCode}>
                  <TableCell className="font-medium">{row.categoryName}</TableCell>
                  {data.legalEntityCodes.map((code) => (
                    <TableCell key={code} className="text-right tabular-nums">
                      {money(row.byLegalEntity[code] ?? "0")}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {moneyZero(row.total)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">Total</TableCell>
                {data.legalEntityCodes.map((code) => (
                  <TableCell
                    key={code}
                    className="text-right font-semibold tabular-nums"
                  >
                    {money(data.totals.byLegalEntity[code] ?? "0")}
                  </TableCell>
                ))}
                <TableCell className="text-right font-bold tabular-nums">
                  {moneyZero(data.totals.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab 5 — Contratos
// ============================================================================

function ContractsTab({ data }: { data: ReportsBundle["contracts"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por estado</CardTitle>
            <CardDescription>
              {data.totalContracts} contrato{data.totalContracts === 1 ? "" : "s"} registrados
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.byStatus.length === 0 ? (
              <EmptyState message="Sin contratos registrados." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Monto mensual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byStatus.map((row) => (
                    <TableRow key={row.status}>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>
                          {contractStatusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.monthlyAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por tipo</CardTitle>
            <CardDescription>Distribución por tipo contractual</CardDescription>
          </CardHeader>
          <CardContent>
            {data.byType.length === 0 ? (
              <EmptyState message="Sin contratos registrados." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byType.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell>{contractTypeLabel(row.type)}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por vencer en 60 días</CardTitle>
          <CardDescription>
            Contratos activos que terminan en los próximos 60 días.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.expiringNext60Days.length === 0 ? (
            <EmptyState message="Ningún contrato vence en los próximos 60 días." />
          ) : (
            <ExpiringTable rows={data.expiringNext60Days} mode="upcoming" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vencidos sin renovar</CardTitle>
          <CardDescription>
            Contratos cuya vigencia terminó pero siguen marcados como vencidos o pendientes de renovar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.expiredNotRenewed.length === 0 ? (
            <EmptyState message="No hay contratos vencidos pendientes de renovar." />
          ) : (
            <ExpiringTable rows={data.expiredNotRenewed} mode="expired" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExpiringTable({
  rows,
  mode,
}: {
  rows: ReportsBundle["contracts"]["expiringNext60Days"];
  mode: "upcoming" | "expired";
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Inquilino</TableHead>
          <TableHead>Local</TableHead>
          <TableHead>{mode === "upcoming" ? "Vence" : "Venció"}</TableHead>
          <TableHead className="text-right">Renta / mes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => {
          const days = Math.abs(c.daysUntilEnd);
          return (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/lessees/${c.lesseeId}`}
                  className="font-medium hover:underline"
                >
                  {c.lesseeLegalName}
                </Link>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <Link href={`/properties/${c.propertyId}`} className="hover:underline">
                  {c.propertyName}
                </Link>{" "}
                · {c.unitCode}
              </TableCell>
              <TableCell>
                {DATE.format(c.endDate)}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({mode === "upcoming" ? `en ${days}d` : `hace ${days}d`})
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(c.monthlyAmount)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function statusVariant(
  status: ContractStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ACTIVE":
      return "default";
    case "DRAFT":
    case "PENDING_RENEWAL":
      return "secondary";
    case "EXPIRED":
    case "TERMINATED":
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

// ============================================================================
// Helpers
// ============================================================================

function SimpleStat({
  label,
  value,
  subValue,
  tone,
}: {
  label: string;
  value: string;
  subValue?: string;
  tone?: "default" | "warning";
}) {
  const valueClass = tone === "warning" ? "text-amber-700" : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription className="text-xs uppercase tracking-wide">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
        {subValue ? (
          <p className="mt-1 text-xs text-muted-foreground">{subValue}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>
  );
}
