import { ArrowLeft, Building2, CalendarRange, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ContractActions } from "@/components/contracts/ContractActions";
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
import { timed } from "@/lib/perf/timed";
import { capitalizeFirst } from "@/lib/utils";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
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
  const pageStart = performance.now();
  const { dbUser } = await requireAuth();
  const [contract, auditLog, canEditDocuments] = await Promise.all([
    timed("contract:getContractById", () => getContractById(id)),
    timed("contract:getContractAuditLog", () => getContractAuditLog(id)),
    timed("contract:hasPermission", () => hasPermission(dbUser.id, "contract.update")),
  ]);
  if (process.env["NODE_ENV"] !== "production" || process.env["PERF_LOG"] === "1") {
    console.log(
      `[PERF] /contracts/[id] TOTAL: ${Math.round(performance.now() - pageStart)}ms`,
    );
  }

  if (!contract) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/contracts"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a contratos
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {contract.lessee.legalName}
              </h1>
              <Badge variant={contractStatusVariant(contract.status)}>
                {contractStatusLabel(contract.status)}
              </Badge>
              <Badge variant="secondary">{contractTypeLabel(contract.type)}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Contrato <span className="font-mono">{contract.id.slice(-8)}</span>
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" />
                <span className="font-medium text-foreground">
                  {contract.unit.property.name}
                </span>
                <span className="text-muted-foreground">
                  · {contract.unit.code}
                  {contract.unit.name ? ` — ${contract.unit.name}` : ""}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="size-3.5" />
                <span className="font-medium text-foreground tabular-nums">
                  {MXN.format(Number(contract.monthlyAmount))}
                </span>
                /mes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="size-3.5" />
                <span className="tabular-nums">
                  {capitalizeFirst(DATE.format(contract.startDate))}
                  {" → "}
                  {capitalizeFirst(DATE.format(contract.endDate))}
                </span>
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <ContractActions
              contractId={contract.id}
              status={contract.status}
              endDate={contract.endDate}
              monthlyAmount={String(contract.monthlyAmount)}
            />
          </div>
        </div>
      </div>

      <ContractDetailTabs
        contract={contract}
        auditLog={auditLog}
        canEditDocuments={canEditDocuments}
      />
    </div>
  );
}
