import { Building, FileCheck, HomeIcon } from "lucide-react";
import { InmueblesTable } from "@/components/properties/InmueblesTable";
import { MetricCard } from "@/components/shared/metric-card";
import {
  getLegalEntities,
  getProperties,
} from "@/lib/services/properties-queries";

export default async function InmueblesPage() {
  const [inmuebles, legalEntities] = await Promise.all([
    getProperties({ typeNotIn: ["PLAZA_COMERCIAL"] }),
    getLegalEntities(),
  ]);

  const conContrato = inmuebles.filter((p) => p.unitCounts.rented > 0).length;
  const sinContrato = inmuebles.length - conContrato;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Inmuebles</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard
          label="Inmuebles activos"
          value={inmuebles.length}
          subValue="propiedades individuales"
          icon={Building}
        />
        <MetricCard
          label="Con contrato activo"
          value={conContrato}
          subValue="rentados actualmente"
          icon={FileCheck}
          color={conContrato > 0 ? "success" : "default"}
        />
        <MetricCard
          label="Disponibles"
          value={sinContrato}
          subValue="sin contrato vigente"
          icon={HomeIcon}
          color={sinContrato > 0 ? "warning" : "success"}
        />
      </div>

      <InmueblesTable inmuebles={inmuebles} legalEntities={legalEntities} />
    </div>
  );
}
