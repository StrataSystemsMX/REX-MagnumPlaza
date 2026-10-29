import { TriangleAlert } from "lucide-react";
import { MobileMorosityList } from "@/components/mobile/MobileMorosityList";
import { MobileRentList } from "@/components/mobile/MobileRentList";
import {
  MobileCard,
  MobileChipLinks,
  MobileKpiLabel,
  MobilePageHeader,
  MobileProgress,
  MobileScreen,
  MobileSegmentedLinks,
} from "@/components/mobile/MobileUI";
import { formatMXN } from "@/shared/format-currency";
import { formatPeriodLong } from "@/shared/format-date";
import { collectionTone, currentPeriodStart, isOverdueStatus } from "@/shared/mobile/format";
import { getMobileMonthRents, getMobileMorosity, type MobileRent } from "@/server/services/mobile-queries";
import { cn } from "@/shared/utils";

export type CollectionsSegment = "mes" | "morosidad";
export type CollectionsFilter = "todos" | "por-cobrar" | "vencidos" | "pagados";

const FILTERS: Array<{ value: CollectionsFilter; label: string; match: (r: MobileRent) => boolean }> = [
  { value: "todos", label: "Todos", match: () => true },
  {
    value: "por-cobrar",
    label: "Por cobrar",
    match: (r) => r.status === "PENDING" || r.status === "DUE" || r.status === "PARTIAL",
  },
  { value: "vencidos", label: "Vencidos", match: (r) => isOverdueStatus(r.status) },
  { value: "pagados", label: "Pagados", match: (r) => r.status === "PAID" },
];

/** Equivalente móvil de /collections y /collections/overdue (handoff §2). */
export async function MobileCollections({
  segment,
  filter,
}: {
  segment: CollectionsSegment;
  filter: CollectionsFilter;
}) {
  const [rents, morosity] = await Promise.all([getMobileMonthRents(), getMobileMorosity()]);

  const expected = rents.reduce((s, r) => s + r.amountDue, 0);
  const collected = rents.reduce((s, r) => s + r.amountPaid, 0);
  const pct = expected > 0 ? Math.round((collected / expected) * 100) : 0;
  const tone = collectionTone(pct);

  const activeFilter = FILTERS.find((f) => f.value === filter) ?? FILTERS[0]!;
  const visible = rents.filter(activeFilter.match);

  const levels = [
    { status: "OVERDUE_1M", label: "1 mes", cls: "text-orange-600" },
    { status: "OVERDUE_2M", label: "2 meses", cls: "text-red-600" },
    { status: "OVERDUE_3M", label: "3 meses", cls: "text-red-700" },
  ] as const;

  return (
    <MobileScreen>
      <MobilePageHeader title="Cobranza" subtitle={formatPeriodLong(currentPeriodStart())} />

      <MobileSegmentedLinks
        fullWidth
        options={[
          { label: "Mes en curso", href: "/collections", active: segment === "mes" },
          {
            label: `Morosidad (${morosity.length})`,
            href: "/collections?seg=morosidad",
            active: segment === "morosidad",
          },
        ]}
      />

      {segment === "mes" ? (
        <div className="flex flex-col gap-3">
          <MobileCard className="flex items-center gap-3.5 px-4 py-3.5">
            <div className="flex flex-1 flex-col gap-2">
              <div className="text-xs text-muted-foreground">
                {formatMXN(collected)} de {formatMXN(expected)}
              </div>
              <MobileProgress pct={pct} barClassName={tone.bar} />
            </div>
            <span className={cn("text-[26px] font-bold tabular-nums", tone.text)}>{pct}%</span>
          </MobileCard>

          <MobileChipLinks
            options={FILTERS.map((f) => ({
              label: (
                <>
                  {f.label} <span className="opacity-60">{rents.filter(f.match).length}</span>
                </>
              ),
              href: f.value === "todos" ? "/collections" : `/collections?filtro=${f.value}`,
              active: f.value === activeFilter.value,
            }))}
          />

          <MobileRentList rents={visible} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {levels.map((l) => {
              const rows = morosity.filter((m) => m.worstStatus === l.status);
              return (
                <MobileCard key={l.status} className="rounded-xl px-3 py-2.5">
                  <MobileKpiLabel>{l.label}</MobileKpiLabel>
                  <div className={cn("text-xl font-semibold", l.cls)}>{rows.length}</div>
                  <div className="truncate text-[11px] text-muted-foreground tabular-nums">
                    {formatMXN(rows.reduce((s, m) => s + m.balance, 0))}
                  </div>
                </MobileCard>
              );
            })}
          </div>

          <div className="flex items-start gap-2 rounded-[10px] bg-[oklch(0.96_0.03_85)] px-3 py-2.5 text-xs leading-[1.4] text-warning">
            <TriangleAlert className="mt-px size-[15px] shrink-0" />
            <span>
              El aviso 3M (notificación de desalojo) nunca se envía automáticamente. Siempre requiere
              confirmación.
            </span>
          </div>

          <MobileMorosityList rows={morosity} />
        </div>
      )}
    </MobileScreen>
  );
}
