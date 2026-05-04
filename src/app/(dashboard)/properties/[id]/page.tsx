import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PropertyDetailTabs } from "@/components/properties/PropertyDetailTabs";
import { requireAuth } from "@/lib/auth/get-session";
import { hasPermission } from "@/lib/auth/permissions";
import { propertyTypeLabel } from "@/lib/i18n/enums";
import {
  getLegalEntities,
  getPropertyById,
} from "@/lib/services/properties-queries";

interface Params {
  id: string;
}

interface SearchParams {
  tab?: string;
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { dbUser } = await requireAuth();
  const [property, legalEntities, canEditPhotos] = await Promise.all([
    getPropertyById(id),
    getLegalEntities(),
    hasPermission(dbUser.id, "property.update"),
  ]);

  if (!property) {
    notFound();
  }

  const isPlaza = property.type === "PLAZA_COMERCIAL";
  const backHref = isPlaza ? "/plazas" : "/inmuebles";
  const backLabel = isPlaza ? "Volver a plazas" : "Volver a inmuebles";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
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

      <PropertyDetailTabs
        property={property}
        legalEntities={legalEntities}
        canEditPhotos={canEditPhotos}
        initialTab={sp.tab}
      />
    </div>
  );
}
