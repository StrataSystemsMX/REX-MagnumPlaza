import Image from "next/image";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { propertyTypeLabel, unitStatusLabel, unitStatusVariant } from "@/shared/i18n/enums";
import { isPlaza } from "@/shared/i18n/unit-label";
import type { PublicVacancyData } from "@/server/services/promoters-public";

interface Props {
  unit: PublicVacancyData["unit"];
  property: PublicVacancyData["property"];
  tenant: PublicVacancyData["tenant"];
  coverUrl: string | null;
}

export function VacancyHero({ unit, property, tenant, coverUrl }: Props) {
  return (
    <section>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted sm:aspect-[16/9] lg:aspect-[16/8]">
        {coverUrl ? (
          <>
            <Image
              src={coverUrl}
              alt=""
              aria-hidden
              fill
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="scale-110 object-cover blur-2xl"
            />
            <Image
              src={coverUrl}
              alt={unit.name ?? property.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-contain"
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <Building2 className="size-20 text-slate-400" />
          </div>
        )}

        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm sm:left-4 sm:top-4">
          {tenant.brandLogoUrl ? (
            <Image
              src={tenant.brandLogoUrl}
              alt={tenant.name}
              width={20}
              height={20}
              className="size-5 rounded object-contain"
            />
          ) : (
            <Building2 className="size-4 text-slate-500" />
          )}
          <span className="text-xs font-medium text-slate-900">{tenant.name}</span>
        </div>

        <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
          <Badge variant={unitStatusVariant(unit.status)} className="shadow-sm">
            {unitStatusLabel(unit.status)}
          </Badge>
        </div>
      </div>

      <div className="mt-5 px-1 sm:mt-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {propertyTypeLabel(property.type)}
          {isPlaza(property.type) ? ` · ${unit.code}` : ""}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl">
          {property.name}
        </h1>
        {unit.name ? (
          <p className="mt-2 text-base text-muted-foreground">{unit.name}</p>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground">{property.address}</p>
      </div>
    </section>
  );
}
