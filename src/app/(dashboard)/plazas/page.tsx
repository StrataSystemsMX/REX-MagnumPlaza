import { Building, Building2, FileCheck, HomeIcon, PercentIcon, Store } from "lucide-react";
import { Suspense } from "react";
import { InmueblesTable } from "@/components/properties/InmueblesTable";
import { PlazasTable } from "@/components/properties/PlazasTable";
import { PropertiesTabs } from "@/components/properties/PropertiesTabs";
import { MetricCard } from "@/components/shared/metric-card";
import {
  getLegalEntities,
  getProperties,
} from "@/lib/services/properties-queries";

export default async function PropiedadesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "inmuebles" ? "inmuebles" : "plazas";

  const [plazas, inmuebles, legalEntities] = await Promise.all([
    getProperties({ typeIn: ["PLAZA_COMERCIAL"] }),
    getProperties({ typeNotIn: ["PLAZA_COMERCIAL"] }),
    getLegalEntities(),
  ]);

  const totalUnits = plazas.reduce((acc, p) => acc + p.unitCounts.total, 0);
  const rentedUnits = plazas.reduce((acc, p) => acc + p.unitCounts.rented, 0);
  const occupancyPct =
    totalUnits > 0 ? Math.round((rentedUnits / totalUnits) * 100) : 0;

  const inmueblesConContrato = inmuebles.filter((p) => p.unitCounts.rented > 0).length;
  const inmueblesSinContrato = inmuebles.length - inmueblesConContrato;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Propiedades</h1>

      <Suspense>
        <PropertiesTabs activeTab={activeTab} />
      </Suspense>

      {activeTab === "plazas" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <MetricCard
              label="Plazas activas"
              value={plazas.length}
              subValue="plazas comerciales"
              icon={Building2}
            />
            <MetricCard
              label="Total locales"
              value={totalUnits}
              subValue={`${rentedUnits} rentados`}
              icon={Store}
            />
            <MetricCard
              label="Ocupación"
              value={`${occupancyPct}%`}
              subValue={`${totalUnits - rentedUnits} disponibles`}
              icon={PercentIcon}
              color={occupancyPct >= 80 ? "success" : occupancyPct >= 50 ? "warning" : "danger"}
            />
          </div>
          <PlazasTable plazas={plazas} legalEntities={legalEntities} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <MetricCard
              label="Inmuebles activos"
              value={inmuebles.length}
              subValue="propiedades individuales"
              icon={Building}
            />
            <MetricCard
              label="Con contrato activo"
              value={inmueblesConContrato}
              subValue="rentados actualmente"
              icon={FileCheck}
              color={inmueblesConContrato > 0 ? "success" : "default"}
            />
            <MetricCard
              label="Disponibles"
              value={inmueblesSinContrato}
              subValue="sin contrato vigente"
              icon={HomeIcon}
              color={inmueblesSinContrato > 0 ? "warning" : "success"}
            />
          </div>
          <InmueblesTable inmuebles={inmuebles} legalEntities={legalEntities} />
        </div>
      )}
    </div>
  );
}
