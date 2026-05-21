import { AirVent, Bath, BedDouble, Car, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  features: Record<string, unknown> | null;
}

const KNOWN: Record<string, { icon: LucideIcon; label: string }> = {
  banos: { icon: Bath, label: "Baños" },
  baños: { icon: Bath, label: "Baños" },
  bathrooms: { icon: Bath, label: "Baños" },
  recamaras: { icon: BedDouble, label: "Recámaras" },
  recámaras: { icon: BedDouble, label: "Recámaras" },
  bedrooms: { icon: BedDouble, label: "Recámaras" },
  ac: { icon: AirVent, label: "A/C" },
  aireAcondicionado: { icon: AirVent, label: "A/C" },
  estacionamiento: { icon: Car, label: "Estacionamiento" },
  parking: { icon: Car, label: "Estacionamiento" },
};

function formatValue(value: unknown): string {
  if (value === true) return "Sí";
  if (value === false) return "No";
  if (value == null) return "—";
  return String(value);
}

export function VacancyFeaturesList({ features }: Props) {
  if (!features || Object.keys(features).length === 0) return null;

  const entries = Object.entries(features);

  return (
    <div>
      <h3 className="mb-3 text-base font-semibold tracking-tight">Características</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {entries.map(([key, value]) => {
          const known = KNOWN[key];
          const Icon = known?.icon ?? Check;
          const label = known?.label ?? key;
          return (
            <li
              key={key}
              className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-xs sm:text-sm">
                <span className="font-medium">{label}</span>
                {value === true ? null : (
                  <span className="ml-1 text-muted-foreground">{formatValue(value)}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
