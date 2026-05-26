import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { PropertyFilterTabs } from "@/components/shared/PropertyFilterTabs";
import { LesseeTable } from "@/components/lessees/LesseeTable";
import { getLessees } from "@/lib/services/lessees-queries";

export default async function LesseesPage({
  searchParams,
}: {
  searchParams: Promise<{ plaza?: string }>;
}) {
  const { plaza } = await searchParams;
  const activePlazaId = plaza ?? null;

  const allLessees = await getLessees({ status: "all" });
  const active = allLessees.filter((l) => l.isActive);

  // Tabs solo para plazas comerciales
  const propertyMap = new Map<string, { id: string; name: string }>();
  for (const l of active) {
    for (const p of l.properties) {
      if (p.type === "PLAZA_COMERCIAL" && !propertyMap.has(p.id))
        propertyMap.set(p.id, { id: p.id, name: p.name });
    }
  }
  const tabProperties = Array.from(propertyMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Metrics siempre sobre el total (no filtrado por tab)
  const withContract = active.filter((l) => l.activeContractsCount > 0);
  const withoutContract = active.filter((l) => l.activeContractsCount === 0);

  // Tabla filtrada por plaza si hay tab activo
  const tableData = activePlazaId
    ? active.filter((l) => l.properties.some((p) => p.id === activePlazaId))
    : active;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inquilinos</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard
          label="Inquilinos activos"
          value={active.length}
          subValue={`${allLessees.length - active.length} inactivos`}
          icon={Users}
        />
        <MetricCard
          label="Con contrato activo"
          value={withContract.length}
          subValue="Ocupando un local"
          icon={CheckCircle2}
          color={withContract.length > 0 ? "success" : "default"}
        />
        <MetricCard
          label="Sin contrato activo"
          value={withoutContract.length}
          subValue={withoutContract.length > 0 ? "Revisar disponibilidad" : "Todos asignados"}
          icon={AlertTriangle}
          color={withoutContract.length > 0 ? "warning" : "success"}
        />
      </div>

      <PropertyFilterTabs properties={tabProperties} activePlazaId={activePlazaId} />

      <LesseeTable lessees={tableData} />
    </div>
  );
}
