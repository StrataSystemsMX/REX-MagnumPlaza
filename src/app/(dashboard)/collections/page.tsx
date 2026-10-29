import { AlertTriangle, CalendarRange, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/shared/metric-card";
import { PropertyFilterTabs } from "@/components/shared/PropertyFilterTabs";
import { CollectionsTabs } from "@/components/collections/CollectionsTabs";
import {
  MobileCollections,
  type CollectionsFilter,
} from "@/components/mobile/MobileCollections";
import { getIsMobileView } from "@/server/mobile/viewport";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/server/auth/get-session";
import { isMaster } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import {
  getMonthlyCollectionsByProperty,
  getOutstandingRents,
  getPayments,
} from "@/server/services/payments-queries";
import { getRentasTableData } from "@/server/services/rentas-queries";
import { timed } from "@/server/perf/timed";
import { formatMXN } from "@/shared/format-currency";

const VALID_TABS = ["mes", "por-cobrar", "historial"] as const;
type CollectionsTab = (typeof VALID_TABS)[number];

const VALID_MES_MODES = ["tarjetas", "kpis"] as const;
type MesMode = (typeof VALID_MES_MODES)[number];

const VALID_ESCALONES = ["all", "1m", "2m", "3m"] as const;
const VALID_MOBILE_FILTERS: CollectionsFilter[] = ["todos", "por-cobrar", "vencidos", "pagados"];
type EscalonParam = (typeof VALID_ESCALONES)[number];

function parsePeriod(periodo?: string): Date {
  if (periodo && /^\d{4}-\d{2}$/.test(periodo)) {
    const [year, month] = periodo.split("-").map(Number);
    return new Date(Date.UTC(year!, month! - 1, 1));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    mode?: string;
    escalon?: string;
    periodo?: string;
    plaza?: string;
    seg?: string;
    filtro?: string;
  }>;
}) {
  const { tenantId, dbUser } = await requireAuth();
  const {
    tab: tabParam,
    mode: modeParam,
    escalon: escalonParam,
    periodo,
    plaza,
    seg,
    filtro,
  } = await searchParams;

  if (await getIsMobileView()) {
    return (
      <MobileCollections
        segment={seg === "morosidad" || tabParam === "por-cobrar" ? "morosidad" : "mes"}
        filter={
          VALID_MOBILE_FILTERS.includes(filtro as CollectionsFilter)
            ? (filtro as CollectionsFilter)
            : "todos"
        }
      />
    );
  }
  const activePlazaId = plaza ?? null;
  const activeTab: CollectionsTab = VALID_TABS.includes(tabParam as CollectionsTab)
    ? (tabParam as CollectionsTab)
    : "mes";
  const mesMode: MesMode =
    activeTab === "mes" && VALID_MES_MODES.includes(modeParam as MesMode)
      ? (modeParam as MesMode)
      : "tarjetas";
  const escalon: EscalonParam =
    activeTab === "por-cobrar" &&
    VALID_ESCALONES.includes(escalonParam as EscalonParam)
      ? (escalonParam as EscalonParam)
      : "all";

  const now = new Date();
  const currentPeriod = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const rentasPeriod = parsePeriod(periodo);

  const pageStart = performance.now();
  const [outstanding, payments, monthly, properties, master, rentasData] =
    await Promise.all([
      timed("collections:getOutstandingRents", () => getOutstandingRents()),
      timed("collections:getPayments", () => getPayments()),
      timed("collections:getMonthlyCollectionsByProperty", () =>
        getMonthlyCollectionsByProperty(currentPeriod),
      ),
      timed("collections:property.findMany", () =>
        prisma.property.findMany({
          where: { tenantId, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, type: true },
        }),
      ),
      timed("collections:isMaster", () => isMaster(dbUser.id)),
      timed("collections:getRentasTableData", () => getRentasTableData(rentasPeriod)),
    ]);
  if (process.env["NODE_ENV"] !== "production" || process.env["PERF_LOG"] === "1") {
    console.log(
      `[PERF] /collections TOTAL: ${Math.round(performance.now() - pageStart)}ms`,
    );
  }

  const totalOutstanding = outstanding.reduce(
    (acc, r) => acc + Number(r.balance),
    0,
  );
  const collectedThisMonth = payments
    .filter(
      (p) =>
        p.paymentDate.getUTCFullYear() === new Date().getUTCFullYear() &&
        p.paymentDate.getUTCMonth() === new Date().getUTCMonth(),
    )
    .reduce((acc, p) => acc + Number(p.amount), 0);

  // Tabs: plazas comerciales (con datos) + flag para Inmuebles si hay no-plazas.
  const tabProperties = properties
    .filter((p) => p.type === "PLAZA_COMERCIAL")
    .map((p) => ({ id: p.id, name: p.name }));
  const hasInmuebles = properties.some((p) => p.type !== "PLAZA_COMERCIAL");


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Cobranza</h1>
        <Button variant="outline" render={<Link href="/ingresos" />}>
          <CalendarRange className="size-4" />
          Vista anual
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard
          label="Cobrado este mes"
          value={<span className="tabular-nums">{formatMXN(collectedThisMonth, 2)}</span>}
          subValue="Pagos registrados"
          icon={CheckCircle2}
          color={collectedThisMonth > 0 ? "success" : "default"}
        />
        <MetricCard
          label="Saldo pendiente"
          value={<span className="tabular-nums">{formatMXN(totalOutstanding, 2)}</span>}
          subValue={`${outstanding.length} renta${outstanding.length === 1 ? "" : "s"} por cobrar`}
          icon={AlertTriangle}
          color={totalOutstanding > 0 ? "danger" : "success"}
        />
        <Link
          href="/collections?tab=por-cobrar&escalon=1m"
          className="block transition-opacity hover:opacity-90"
        >
          <MetricCard
            label="Rentas vencidas"
            value={outstanding.length}
            subValue="ver morosidad"
            icon={Clock}
            color={outstanding.length > 0 ? "warning" : "success"}
          />
        </Link>
      </div>

      <PropertyFilterTabs
        properties={tabProperties}
        activePlazaId={activePlazaId}
        showInmueblesTab={hasInmuebles}
      />

      <CollectionsTabs
        outstanding={outstanding}
        payments={payments}
        monthly={monthly}
        canDeletePayment={master}
        canEditPayment={master}
        rentasData={rentasData}
        activeTab={activeTab}
        mesMode={mesMode}
        escalon={escalon}
        activePlazaId={activePlazaId}
      />
    </div>
  );
}
