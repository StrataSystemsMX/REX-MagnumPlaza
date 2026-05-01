import { PropertyTable } from "@/components/properties/PropertyTable";
import {
  getLegalEntities,
  getProperties,
} from "@/lib/services/properties-queries";

export default async function PropertiesPage() {
  const [properties, legalEntities] = await Promise.all([
    getProperties(),
    getLegalEntities(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inmuebles</h1>
        <p className="text-sm text-muted-foreground">
          {properties.length} inmuebles activos. Gestiona plazas, edificios, terrenos y oficinas.
        </p>
      </div>
      <PropertyTable properties={properties} legalEntities={legalEntities} />
    </div>
  );
}
