import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ContractDetailTabs } from "@/components/contracts/ContractDetailTabs";
import { requireAuth } from "@/lib/auth/get-session";
import { hasPermission } from "@/lib/auth/permissions";
import {
  contractStatusLabel,
  contractStatusVariant,
  contractTypeLabel,
} from "@/lib/i18n/enums";
import {
  getContractAuditLog,
  getContractById,
} from "@/lib/services/contracts-queries";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

interface Params {
  id: string;
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const { dbUser } = await requireAuth();
  const [contract, auditLog, canEditDocuments] = await Promise.all([
    getContractById(id),
    getContractAuditLog(id),
    hasPermission(dbUser.id, "contract.update"),
  ]);

  if (!contract) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/contracts"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a contratos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Contrato{" "}
            <span className="font-mono text-base">{contract.id.slice(-8)}</span>
          </h1>
          <Badge variant={contractStatusVariant(contract.status)}>
            {contractStatusLabel(contract.status)}
          </Badge>
          <Badge variant="secondary">{contractTypeLabel(contract.type)}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {contract.lessee.legalName} ·{" "}
          <Link
            href={`/lessees/${contract.lessee.id}`}
            className="hover:underline"
          >
            ver inquilino
          </Link>{" "}
          · {contract.unit.property.name} {contract.unit.code} ·{" "}
          {MXN.format(Number(contract.monthlyAmount))}/mes
        </p>
      </div>

      <ContractDetailTabs
        contract={contract}
        auditLog={auditLog}
        canEditDocuments={canEditDocuments}
      />
    </div>
  );
}
