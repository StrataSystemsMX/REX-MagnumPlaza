import { CollectionsTabs } from "@/components/collections/CollectionsTabs";
import { requireAuth } from "@/lib/auth/get-session";
import { isMaster } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma/client";
import {
  getAllRentsForCalendar,
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

  const [outstanding, payments, calendarRents, properties, master] = await Promise.all([
    getOutstandingRents(),
    getPayments(),
    getAllRentsForCalendar(),
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cobranza</h1>
        <p className="text-sm text-muted-foreground">
          Saldo pendiente:{" "}
          <span className="font-semibold text-destructive">
            {MXN.format(totalOutstanding)}
          </span>{" "}
          en {outstanding.length} renta{outstanding.length === 1 ? "" : "s"} ·
          Cobrado este mes:{" "}
          <span className="font-semibold">{MXN.format(collectedThisMonth)}</span>
        </p>
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
        properties={properties}
        canDeletePayment={master}
      />
    </div>
  );
}
