import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { LesseeDetailTabs } from "@/components/lessees/LesseeDetailTabs";
import { communicationChannelLabel } from "@/shared/i18n/enums";
import { getAvailableUnits } from "@/server/services/contracts-queries";
import { getLesseeById, getOverdueRentsByLessee } from "@/server/services/lessees-queries";
import { getNotificationLogsByLessee } from "@/server/services/notifications-queries";
import {
  getLesseeStatement,
  getPaymentsByLessee,
} from "@/server/services/payments-queries";

interface Params {
  id: string;
}

export default async function LesseeDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const [lessee, statement, payments, notifications, overdueRents, availableUnits] =
    await Promise.all([
      getLesseeById(id),
      getLesseeStatement(id),
      getPaymentsByLessee(id),
      getNotificationLogsByLessee(id),
      getOverdueRentsByLessee(id),
      getAvailableUnits(),
    ]);

  if (!lessee || !statement) {
    notFound();
  }

  const activeContracts = lessee.contracts.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/lessees"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a inquilinos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{lessee.legalName}</h1>
          <Badge variant="secondary">
            {communicationChannelLabel(lessee.preferredChannel)}
          </Badge>
          {activeContracts > 0 ? (
            <Badge>
              {activeContracts} contrato{activeContracts === 1 ? "" : "s"} activo
              {activeContracts === 1 ? "" : "s"}
            </Badge>
          ) : null}
          {!lessee.isActive ? <Badge variant="destructive">Inactivo</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {lessee.contactName ? <>Contacto: <span className="font-medium">{lessee.contactName}</span></> : null}
          {lessee.contactName && lessee.rfc ? " · " : null}
          {lessee.rfc ? <>RFC: <span className="font-mono">{lessee.rfc}</span></> : null}
        </p>
      </div>

      <LesseeDetailTabs
        lessee={lessee}
        statement={statement}
        payments={payments}
        notifications={notifications}
        overdueRents={overdueRents}
        availableUnits={availableUnits}
      />
    </div>
  );
}
