import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PropertyDetailTabs } from "@/components/properties/PropertyDetailTabs";
import { propertyTypeLabel } from "@/lib/i18n/enums";
import {
  getLegalEntities,
  getPropertyById,
} from "@/lib/services/properties-queries";

interface Params {
  id: string;
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const [property, legalEntities] = await Promise.all([
    getPropertyById(id),
    getLegalEntities(),
  ]);

  if (!property) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/properties"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a inmuebles
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{property.name}</h1>
          <Badge variant="secondary">{propertyTypeLabel(property.type)}</Badge>
          {!property.isActive ? <Badge variant="destructive">Inactivo</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Dueña: <span className="font-medium">{property.ownerEntity.code}</span> ·
          Administra: <span className="font-medium">{property.managerEntity.code}</span>
          {property.cadastralKey ? <> · Clave catastral: {property.cadastralKey}</> : null}
        </p>
      </div>

      <PropertyDetailTabs property={property} legalEntities={legalEntities} />
    </div>
  );
}
