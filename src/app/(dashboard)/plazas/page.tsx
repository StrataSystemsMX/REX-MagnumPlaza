import { PlazasTable } from "@/components/properties/PlazasTable";
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plazas</h1>
        <p className="text-sm text-muted-foreground">
          {plazas.length} plaza{plazas.length === 1 ? "" : "s"} comercial
          {plazas.length === 1 ? "" : "es"} activa{plazas.length === 1 ? "" : "s"}.
          {totalUnits > 0 ? (
            <>
              {" "}
              {totalUnits} local{totalUnits === 1 ? "" : "es"} en total ·{" "}
              <span className="font-medium text-foreground">{occupancyPct}%</span> ocupados.
            </>
          ) : null}
        </p>
      </div>
      <PlazasTable plazas={plazas} legalEntities={legalEntities} />
    </div>
  );
}
