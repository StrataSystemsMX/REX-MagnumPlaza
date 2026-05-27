import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { ContractTable } from "@/components/contracts/ContractTable";
import { MetricCard } from "@/components/shared/metric-card";
import { PropertyFilterTabs } from "@/components/shared/PropertyFilterTabs";
import { INMUEBLES_TAB_VALUE } from "@/components/shared/property-filter-constants";
import {
  getAvailableUnits,
  getContracts,
} from "@/lib/services/contracts-queries";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ plaza?: string }>;
}) {
  const { plaza } = await searchParams;
  const activePlazaId = plaza ?? null;

  const [allContracts, availableUnits] = await Promise.all([
    getContracts(),
    getAvailableUnits(),
  ]);

  // Tabs solo para plazas comerciales
  const propertyMap = new Map<string, { id: string; name: string }>();
  let hasInmuebles = false;
  for (const c of allContracts) {
    const p = c.unit.property;
    if (p.type === "PLAZA_COMERCIAL") {
      if (!propertyMap.has(p.id)) propertyMap.set(p.id, { id: p.id, name: p.name });
    } else {
      hasInmuebles = true;
    }
  }
  const tabProperties = Array.from(propertyMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Metrics siempre sobre el total
  const active = allContracts.filter((c) => c.status === "ACTIVE");
  const draft = allContracts.filter((c) => c.status === "DRAFT").length;
  const expiringSoon = active.filter(
    (c) => c.daysToExpire >= 0 && c.daysToExpire <= 60,
  ).length;

  // Tabla filtrada por plaza/inmuebles si hay tab activo
  const tableContracts =
    activePlazaId === INMUEBLES_TAB_VALUE
      ? allContracts.filter((c) => c.unit.property.type !== "PLAZA_COMERCIAL")
      : activePlazaId
        ? allContracts.filter((c) => c.unit.property.id === activePlazaId)
        : allContracts;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contratos</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard
          label="Total"
          value={allContracts.length}
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

      <PropertyFilterTabs
        properties={tabProperties}
        activePlazaId={activePlazaId}
        showInmueblesTab={hasInmuebles}
      />

      <ContractTable contracts={tableContracts} availableUnits={availableUnits} />
    </div>
  );
}
