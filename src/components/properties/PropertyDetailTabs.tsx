"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyForm } from "@/components/forms/PropertyForm";
import { UnitTable } from "@/components/properties/UnitTable";
import type { LegalEntityOption, PropertyDetail } from "@/lib/services/properties-queries";

interface PropertyDetailTabsProps {
  property: PropertyDetail;
  legalEntities: ReadonlyArray<LegalEntityOption>;
}

export function PropertyDetailTabs({ property, legalEntities }: PropertyDetailTabsProps) {
  return (
    <Tabs defaultValue="info" className="w-full">
      <TabsList>
        <TabsTrigger value="info">Información general</TabsTrigger>
        <TabsTrigger value="units">
          Unidades ({property.units.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="info" className="mt-4 rounded-md border bg-card p-6">
        <PropertyForm
          legalEntities={legalEntities}
          initial={{
            id: property.id,
            name: property.name,
            type: property.type,
            address: property.address,
            ownerEntityId: property.ownerEntity.id,
            managerEntityId: property.managerEntity.id,
            cadastralKey: property.cadastralKey,
            latitude: property.latitude,
            longitude: property.longitude,
            totalArea: property.totalArea,
            notes: property.notes,
          }}
          submitLabel="Guardar cambios"
        />
      </TabsContent>
      <TabsContent value="units" className="mt-4 space-y-3">
        <UnitTable propertyId={property.id} units={property.units} />
      </TabsContent>
    </Tabs>
  );
}
