import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { ContractTable } from "@/components/contracts/ContractTable";
import { MetricCard } from "@/components/shared/metric-card";
import {
  getAvailableUnits,
  getContracts,
} from "@/lib/services/contracts-queries";

export default async function ContractsPage() {
  const [contracts, availableUnits] = await Promise.all([
    getContracts(),
    getAvailableUnits(),
  ]);

  const active = contracts.filter((c) => c.status === "ACTIVE");
  const draft = contracts.filter((c) => c.status === "DRAFT").length;
  const expiringSoon = active.filter(
    (c) => c.daysToExpire >= 0 && c.daysToExpire <= 60,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contratos</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona contratos de arrendamiento, renovaciones y terminaciones.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Total"
          value={contracts.length}
          subValue={`${draft} en borrador`}
          icon={FileText}
        />
        <MetricCard
          label="Activos"
          value={active.length}
          icon={CheckCircle2}
          color="success"
        />
        <MetricCard
          label="Por vencer (≤60d)"
          value={expiringSoon}
          subValue="Requieren renovación"
          icon={AlertTriangle}
          color={expiringSoon > 0 ? "warning" : "default"}
        />
      </div>

      <ContractTable contracts={contracts} availableUnits={availableUnits} />
    </div>
  );
}
