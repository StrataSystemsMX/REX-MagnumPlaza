import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  MobileBackLink,
  MobileCard,
  MobileKpiLabel,
  MobilePageHeader,
  MobileScreen,
  rentStatusDot,
} from "@/components/mobile/MobileUI";
import { formatMXN } from "@/shared/format-currency";
import { propertyTypeLabel, rentStatusLabel } from "@/shared/i18n/enums";
import { withOrigin, type MobileOrigin } from "@/shared/mobile/nav";
import type { MonthlyPropertyGroup, MonthlyUnitRow } from "@/server/services/payments-queries";
import { cn } from "@/shared/utils";

function unitDot(u: MonthlyUnitRow): string {
  if (u.status === "VACANT") return "bg-secondary";
  return rentStatusDot(u.rentStatus ?? "PENDING");
}

function propertyStats(p: MonthlyPropertyGroup) {
  const occupied = p.units.filter((u) => u.status !== "VACANT");
  const due = occupied.reduce((s, u) => s + Number(u.amountDue), 0);
  const paid = occupied.reduce((s, u) => s + Number(u.amountPaid), 0);
  return {
    occupied: occupied.length,
    total: p.units.length,
    occupancyPct: p.units.length > 0 ? Math.round((occupied.length / p.units.length) * 100) : 0,
    collectedPct: due > 0 ? Math.round((paid / due) * 100) : 0,
    expected: Number(p.expectedTotal),
  };
}

function propertyMeta(p: MonthlyPropertyGroup): string {
  const type = propertyTypeLabel(p.propertyType);
  return p.ownerEntityCode !== p.managerEntityCode
    ? `${type} · ${p.ownerEntityCode} → administra ${p.managerEntityCode}`
    : `${type} · ${p.managerEntityCode}`;
}

/** Lista de inmuebles con tira de ocupación (handoff §3). */
export function MobileProperties({ properties }: { properties: MonthlyPropertyGroup[] }) {
  const totalUnits = properties.reduce((s, p) => s + p.units.length, 0);

  return (
    <MobileScreen>
      <MobilePageHeader
        title="Propiedades"
        subtitle={`${properties.length} inmuebles · ${totalUnits} locales`}
      />
      {properties.map((p) => {
        const stats = propertyStats(p);
        return (
          <Link key={p.propertyId} href={`/plazas/${p.propertyId}`}>
            <MobileCard className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-[42px] flex-none items-center justify-center rounded-[10px] bg-secondary text-primary">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15.5px] font-semibold">{p.propertyName}</div>
                  <div className="text-xs text-muted-foreground">{propertyMeta(p)}</div>
                </div>
                <ChevronRight className="mt-1 size-[18px] text-[oklch(0.7_0.05_230)]" />
              </div>
              {p.units.length > 0 ? (
                <div className="flex gap-[3px]">
                  {p.units.map((u) => (
                    <div key={u.unitId} className={cn("h-2 flex-1 rounded-[3px]", unitDot(u))} />
                  ))}
                </div>
              ) : null}
              <div className="flex justify-between text-[12.5px] text-muted-foreground">
                <span>
                  {stats.occupied}/{stats.total} ocupados · {stats.collectedPct}% cobrado
                </span>
                <span className="tabular-nums">
                  <b className="font-semibold text-foreground">{formatMXN(stats.expected)}</b> / mes
                </span>
              </div>
            </MobileCard>
          </Link>
        );
      })}
    </MobileScreen>
  );
}

/** Detalle de plaza: stats + grid de locales (handoff §3 › Detalle plaza). */
export function MobilePlazaDetail({
  property,
  back,
}: {
  property: MonthlyPropertyGroup;
  back: { href: string; label: string };
}) {
  const stats = propertyStats(property);
  const origin: MobileOrigin = `plaza-${property.propertyId}`;

  return (
    <MobileScreen>
      <MobileBackLink href={back.href} label={back.label} />
      <MobilePageHeader size="md" title={property.propertyName} subtitle={propertyMeta(property)} />

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Ocupación", value: `${stats.occupancyPct}%` },
          { label: "Renta/mes", value: formatMXN(stats.expected) },
          { label: "Cobrado", value: `${stats.collectedPct}%` },
        ].map((s) => (
          <MobileCard key={s.label} className="rounded-xl px-3 py-2.5">
            <MobileKpiLabel>{s.label}</MobileKpiLabel>
            <div className="truncate text-lg font-semibold tabular-nums">{s.value}</div>
          </MobileCard>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {property.units.map((u) => {
          const vacant = u.status === "VACANT";
          const body = (
            <>
              <div className="flex items-center justify-between">
                <span className="font-heading text-[17px] font-bold">{u.unitCode}</span>
                <span className={cn("size-[9px] rounded-full", unitDot(u))} />
              </div>
              <div className="line-clamp-2 text-[13px] font-medium">
                {vacant ? "Disponible" : u.lesseeLegalName}
              </div>
              <div className="mt-auto text-[11.5px] text-muted-foreground">
                {vacant ? "Sin contrato" : u.rentStatus ? rentStatusLabel(u.rentStatus) : "Sin renta este mes"}
              </div>
            </>
          );
          const cls = "flex min-h-[104px] flex-col gap-1 rounded-xl p-3";
          return vacant || !u.lesseeId ? (
            <div key={u.unitId} className={cn(cls, "border border-dashed border-border")}>
              {body}
            </div>
          ) : (
            <Link
              key={u.unitId}
              href={withOrigin(`/lessees/${u.lesseeId}`, origin)}
              className={cn(cls, "bg-card shadow-[0_0_0_1px_rgba(11,14,41,.08)]")}
            >
              {body}
            </Link>
          );
        })}
      </div>
      {property.units.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin locales registrados</p>
      ) : null}
    </MobileScreen>
  );
}
