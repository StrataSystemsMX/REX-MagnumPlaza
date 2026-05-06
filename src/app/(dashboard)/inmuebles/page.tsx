import { InmueblesTable } from "@/components/properties/InmueblesTable";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inmuebles</h1>
        <p className="text-sm text-muted-foreground">
          {inmuebles.length} inmueble{inmuebles.length === 1 ? "" : "s"} activo
          {inmuebles.length === 1 ? "" : "s"}.
          {inmuebles.length > 0 ? (
            <>
              {" "}
              <span className="font-medium text-foreground">{conContrato}</span> con contrato activo.
            </>
          ) : null}
        </p>
      </div>
      <InmueblesTable inmuebles={inmuebles} legalEntities={legalEntities} />
    </div>
  );
}
