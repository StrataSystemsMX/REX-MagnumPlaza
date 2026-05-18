import { AlertTriangle, CalendarRange, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/shared/metric-card";
import { CollectionsTabs } from "@/components/collections/CollectionsTabs";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/get-session";
import { isMaster } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  getAllRentsForCalendar,
  getMonthlyCollectionsByProperty,
  getOutstandingRents,
  getPayments,
} from "@/lib/services/payments-queries";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

export default async function CollectionsPage() {
  const { tenantId, dbUser } = await requireAuth();

  const now = new Date();
  const currentPeriod = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const [outstanding, payments, calendarRents, monthly, properties, master] =
    await Promise.all([
      getOutstandingRents(),
      getPayments(),
      getAllRentsForCalendar(),
      getMonthlyCollectionsByProperty(currentPeriod),
      prisma.property.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      isMaster(dbUser.id),
    ]);

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
          label="Saldo pendiente"
          value={<span className="tabular-nums">{MXN.format(totalOutstanding)}</span>}
          subValue={`${outstanding.length} renta${outstanding.length === 1 ? "" : "s"} por cobrar`}
          icon={AlertTriangle}
          color={totalOutstanding > 0 ? "danger" : "success"}
        />
        <MetricCard
          label="Cobrado este mes"
          value={<span className="tabular-nums">{MXN.format(collectedThisMonth)}</span>}
          subValue="Pagos registrados"
          icon={CheckCircle2}
          color={collectedThisMonth > 0 ? "success" : "default"}
        />
        <MetricCard
          label="Rentas vencidas"
          value={outstanding.length}
          subValue="con saldo pendiente"
          icon={Clock}
          color={outstanding.length > 0 ? "warning" : "success"}
        />
      </div>

      <CollectionsTabs
        outstanding={outstanding}
        payments={payments}
        calendarRents={calendarRents.map((r) => ({
          id: r.id,
          period: r.period,
          amountDue: r.amountDue.toString(),
          amountPaid: r.amountPaid.toString(),
          status: r.status,
          contract: {
            lessee: { legalName: r.contract.lessee.legalName },
            unit: {
              code: r.contract.unit.code,
              property: { name: r.contract.unit.property.name },
            },
          },
        }))}
        monthly={monthly}
        properties={properties}
        canDeletePayment={master}
      />
    </div>
  );
}
