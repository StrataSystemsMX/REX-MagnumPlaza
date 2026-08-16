import { CalendarClock, Check, Coins, ShieldCheck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { includedServiceLabel } from "@/shared/i18n/enums";
import type { PublicVacancyData } from "@/server/services/promoters-public";
import { formatMXN } from "@/shared/format-currency";
import { formatDate } from "@/shared/format-date";

interface Props {
  unit: PublicVacancyData["unit"];
}

function monthsLabel(n: number): string {
  return n === 1 ? "1 mes" : `${n} meses`;
}

interface Stat {
  icon: LucideIcon;
  label: string;
  value: string;
}

export function VacancyTerms({ unit }: Props) {
  const hasMaintenanceIncluded = unit.includedServices.includes("MANTENIMIENTO");

  const stats: Stat[] = [];

  if (unit.depositMonths != null) {
    stats.push({
      icon: ShieldCheck,
      label: "Depósito",
      value: monthsLabel(unit.depositMonths),
    });
  }
  if (unit.minContractMonths != null) {
    stats.push({
      icon: Coins,
      label: "Plazo mínimo",
      value: monthsLabel(unit.minContractMonths),
    });
  }
  if (unit.maintenanceFee != null) {
    stats.push({
      icon: Wallet,
      label: "Mantenimiento",
      value: `${formatMXN(unit.maintenanceFee)} / mes`,
    });
  } else if (hasMaintenanceIncluded) {
    stats.push({
      icon: Wallet,
      label: "Mantenimiento",
      value: "Incluido",
    });
  }

  // Solo mostramos disponibilidad si es a futuro; "Inmediato" sin contexto agrega ruido.
  if (unit.availableFrom != null && unit.availableFrom.getTime() > Date.now()) {
    stats.push({
      icon: CalendarClock,
      label: "Disponible",
      value: formatDate(unit.availableFrom),
    });
  }

  const hasServices = unit.includedServices.length > 0;

  if (stats.length === 0 && !hasServices) return null;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
          Condiciones comerciales
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Términos clave antes de agendar visita.
        </p>
      </div>

      {stats.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl border bg-card p-3 sm:p-4">
              <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <p className="mt-2 text-xs text-muted-foreground">{label}</p>
              <p className="mt-0.5 truncate text-sm font-semibold sm:text-base">
                {value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {hasServices ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-tight">
            Servicios incluidos en la renta
          </h3>
          <ul className="flex flex-wrap gap-2">
            {unit.includedServices.map((s) => (
              <li
                key={s}
                className="inline-flex items-center gap-1.5 rounded-full border bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
              >
                <Check className="size-3.5" strokeWidth={2.25} />
                {includedServiceLabel(s)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
