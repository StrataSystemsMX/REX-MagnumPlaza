import { Building2, PercentIcon, Store } from "lucide-react";
import { PlazasTable } from "@/components/properties/PlazasTable";
import { MetricCard } from "@/components/shared/metric-card";
import {
  getLegalEntities,
  getProperties,
} from "@/lib/services/properties-queries";

export default async function PlazasPage() {
  const [plazas, legalEntities] = await Promise.all([
    getProperties({ typeIn: ["PLAZA_COMERCIAL"] }),
    getLegalEntities(),
  ]);

  const totalUnits = plazas.reduce((acc, p) => acc + p.unitCounts.total, 0);
  const rentedUnits = plazas.reduce((acc, p) => acc + p.unitCounts.rented, 0);
  const occupancyPct =
    totalUnits > 0 ? Math.round((rentedUnits / totalUnits) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Plazas y Locales</h1>

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
  );
}
