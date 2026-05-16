"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyForm } from "@/components/forms/PropertyForm";
import { PropertyPhotoGallery } from "@/components/properties/PropertyPhotoGallery";
import { UnitTable } from "@/components/properties/UnitTable";
import type { LegalEntityOption, PropertyDetail } from "@/lib/services/properties-queries";

interface PropertyDetailTabsProps {
  property: PropertyDetail;
  legalEntities: ReadonlyArray<LegalEntityOption>;
  canEditPhotos: boolean;
  /** Tab inicial vía `?tab=info|units|photos`. Default: info. */
  initialTab?: string;
}

const VALID_TABS = ["info", "units", "photos"] as const;

export function PropertyDetailTabs({
  property,
  legalEntities,
  canEditPhotos,
  initialTab,
}: PropertyDetailTabsProps) {
  // Sólo las plazas comerciales tienen "unidades" (locales). Los inmuebles
  // individuales muestran contratos directamente, no locales.
  const showUnits = property.type === "PLAZA_COMERCIAL";
  const requestedTab = (VALID_TABS as ReadonlyArray<string>).includes(initialTab ?? "")
    ? (initialTab as (typeof VALID_TABS)[number])
    : "info";
  const defaultTab = !showUnits && requestedTab === "units" ? "info" : requestedTab;

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList>
          <TabsTrigger value="info">Información general</TabsTrigger>
          {showUnits ? (
            <TabsTrigger value="units">
              Unidades ({property.units.length})
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="photos">
            Fotos ({property.documents.length})
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="info" className="mt-4 rounded-md border bg-card p-6">
        <PropertyForm
          legalEntities={legalEntities}
          initial={{
            id: property.id,
            name: property.name,
            type: property.type,
            status: property.status,
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
      {showUnits ? (
        <TabsContent value="units" className="mt-4 space-y-3">
          <UnitTable propertyId={property.id} units={property.units} />
        </TabsContent>
      ) : null}
      <TabsContent value="photos" className="mt-4 space-y-4">
        <PropertyPhotoGallery
          propertyId={property.id}
          photos={property.documents}
          canEdit={canEditPhotos}
        />
      </TabsContent>
    </Tabs>
  );
}
