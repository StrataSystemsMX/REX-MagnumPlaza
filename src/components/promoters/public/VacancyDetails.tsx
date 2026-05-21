import { MapPin, Maximize2, Store, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { propertyTypeLabel } from "@/lib/i18n/enums";
import type { PublicVacancyData } from "@/lib/services/promoters-public";
import { VacancyFeaturesList } from "./VacancyFeaturesList";

interface Props {
  unit: PublicVacancyData["unit"];
  property: PublicVacancyData["property"];
}

interface Stat {
  icon: LucideIcon;
  label: string;
  value: string;
}

export function VacancyDetails({ unit, property }: Props) {
  const area = unit.area ?? property.totalArea;

  const stats: Stat[] = [
    { icon: Store, label: "Tipo", value: propertyTypeLabel(property.type) },
    { icon: Maximize2, label: "Área", value: area != null ? `${area} m²` : "—" },
    { icon: Tag, label: "Local", value: unit.code },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
          Información del local
        </h2>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
          {stats.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="rounded-xl border bg-card p-3 sm:p-4"
            >
              <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <p className="mt-2 text-xs text-muted-foreground">{label}</p>
              <p className="mt-0.5 truncate text-sm font-semibold sm:text-base">
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
        <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Dirección
          </p>
          <p className="mt-0.5 text-sm font-medium text-balance">{property.address}</p>
        </div>
      </div>

      <VacancyFeaturesList features={unit.features} />
    </section>
  );
}
