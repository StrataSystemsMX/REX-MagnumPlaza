import { ContractTable } from "@/components/contracts/ContractTable";
import {
  getAvailableUnits,
  getContracts,
} from "@/lib/services/contracts-queries";

export default async function ContractsPage() {
  const [contracts, availableUnits] = await Promise.all([
    getContracts(),
    getAvailableUnits(),
  ]);

  const active = contracts.filter((c) => c.status === "ACTIVE").length;
  const draft = contracts.filter((c) => c.status === "DRAFT").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contratos</h1>
        <p className="text-sm text-muted-foreground">
          {contracts.length} contratos registrados · {active} activos · {draft} en borrador.
        </p>
      </div>
      <ContractTable contracts={contracts} availableUnits={availableUnits} />
    </div>
  );
}
