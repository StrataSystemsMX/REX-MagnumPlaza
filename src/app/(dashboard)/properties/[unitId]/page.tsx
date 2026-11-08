import { ArrowLeft, Building2, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { UnitDetailActions } from "@/components/properties/UnitDetailActions";
import { UnitDetailTabs } from "@/components/properties/UnitDetailTabs";
import { requireAuth } from "@/server/auth/get-session";
import { getLegalEntities } from "@/server/services/properties-queries";
import { getUnitDetail } from "@/server/services/units-queries";
import { propertyStatusLabel, unitStatusLabel, unitStatusVariant } from "@/shared/i18n/enums";
import { isPlaza, unitCode } from "@/shared/i18n/unit-label";
import { formatMXN } from "@/shared/format-currency";

interface Params {
  unitId: string;
}

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { unitId } = await params;
  await requireAuth();

  const [unit, legalEntities] = await Promise.all([
    getUnitDetail(unitId),
    getLegalEntities(),
  ]);

  if (!unit) {
    notFound();
  }

  const plaza = isPlaza(unit.property.type);
  const backHref = plaza ? "/plazas" : "/plazas?tab=inmuebles";
  const backLabel = plaza ? "Volver a plazas" : "Volver a inmuebles";
  const title = plaza ? unit.property.name : unit.property.name;
  const rent = unit.contract ? unit.contract.monthlyAmount : unit.estimatedRent;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {plaza ? (
                <Badge variant={unitStatusVariant(unit.status)}>
                  {unitStatusLabel(unit.status)}
                </Badge>
              ) : (
                <Badge variant="secondary">{propertyStatusLabel(unit.property.status)}</Badge>
              )}
            </div>
            {plaza ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {unit.property.name} · Local {unitCode(unit)}
                {unit.name ? ` — ${unit.name}` : ""}
              </p>
            ) : unit.property.address ? (
              <p className="mt-1 text-xs text-muted-foreground">{unit.property.address}</p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" />
                <span className="font-medium text-foreground">
                  {unit.property.ownerEntity.code}
                </span>
                <span>dueña</span>
                <span aria-hidden>·</span>
                <span className="font-medium text-foreground">
                  {unit.property.managerEntity.code}
                </span>
                <span>administra</span>
              </span>
              {rent !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="size-3.5" />
                  <span className="font-medium text-foreground tabular-nums">
                    {formatMXN(rent, 2)}
                  </span>
                  /mes
                </span>
              ) : null}
            </div>
          </div>

          <div className="shrink-0">
            <UnitDetailActions unit={unit} legalEntities={legalEntities} />
          </div>
        </div>
      </div>

      <UnitDetailTabs unit={unit} />
    </div>
  );
}
