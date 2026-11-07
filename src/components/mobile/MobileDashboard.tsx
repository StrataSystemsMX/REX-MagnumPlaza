import { AlertCircle, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  MobileCard,
  MobileChipLinks,
  MobileKpiLabel,
  MobileProgress,
  MobileScreen,
  MobileSectionTitle,
  MobileSegmentedLinks,
  overduePill,
  MobilePageHeader,
} from "@/components/mobile/MobileUI";
import type { RentStatus } from "@/generated/prisma/enums";
import { formatMXN, formatPercent } from "@/shared/format-currency";
import { collectionTone, initials } from "@/shared/mobile/format";
import { withOrigin } from "@/shared/mobile/nav";
import { cn } from "@/shared/utils";

interface MobileDashboardProps {
  tenantName: string;
  userName: string;
  /** Perfil Dueño: oculta "Pendientes de hoy", muestra "Por Razón Social". */
  isOwnerView: boolean;
  mode: "anual" | "mensual";
  selectedMonth: number;
  periodLabel: string;
  monthLabel: string;
  legalEntities: Array<{ id: string; code: string }>;
  activeLegalEntityId: string | null;
  pending: { porCobrar: number; avisosSinEnviar: number; mantenimientosAtrasados: number };
  kpis: { ventas: number; egresos: number; utilidad: number; rentabilidad: number };
  cobranza: {
    pct: number;
    collected: number;
    expected: number;
    paid: number;
    partial: number;
    pending: number;
    overdue: number;
  };
  alerts: Array<{ level: "warning" | "critical"; message: string }>;
  topOverdue: Array<{
    lesseeId: string;
    legalName: string;
    unitLabel: string;
    total: number;
    count: number;
    worstStatus: RentStatus;
  }>;
  byLegalEntity: Array<{ id: string; code: string; income: number; profit: number; rent: number }>;
  ranking: Array<{
    id: string;
    name: string;
    expectedMonthly: number;
    totalUnits: number;
    rentedUnits: number;
  }>;
}

/** Equivalente móvil de `(dashboard)/page.tsx` (handoff Rex Mobile §1). */
export function MobileDashboard(props: MobileDashboardProps) {
  const { mode, selectedMonth, activeLegalEntityId, cobranza, kpis } = props;

  const href = (next: { mode?: string; legalEntity?: string | null }) => {
    const q = new URLSearchParams();
    const m = next.mode ?? mode;
    q.set("mode", m);
    if (m === "mensual") q.set("mes", String(selectedMonth));
    const le = next.legalEntity === undefined ? activeLegalEntityId : next.legalEntity;
    q.set("legalEntity", le ?? "all");
    return `/?${q.toString()}`;
  };

  const tone = collectionTone(cobranza.pct);
  const maxExpected = props.ranking[0]?.expectedMonthly ?? 1;

  return (
    <MobileScreen className="gap-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo/StrataSystem_logo.png"
            alt="Rex"
            width={34}
            height={34}
            className="size-[34px] rounded-[9px] object-cover"
            priority
          />
          <div className="leading-[1.15]">
            <div className="text-[15px] font-semibold">Rex</div>
            <div className="text-xs text-muted-foreground">{props.tenantName}</div>
          </div>
        </div>
        <Link
          href="/mas"
          aria-label="Perfil"
          className="flex size-[34px] items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground"
        >
          {initials(props.userName)}
        </Link>
      </div>

      <MobilePageHeader
        title="Dashboard"
        subtitle={props.periodLabel}
        right={
          <MobileSegmentedLinks
            options={[
              { label: "Anual", href: href({ mode: "anual" }), active: mode === "anual" },
              { label: "Mensual", href: href({ mode: "mensual" }), active: mode === "mensual" },
            ]}
          />
        }
      />

      <MobileChipLinks
        options={[
          { label: "Todas", href: href({ legalEntity: null }), active: !activeLegalEntityId },
          ...props.legalEntities.map((le) => ({
            label: le.code,
            href: href({ legalEntity: le.id }),
            active: activeLegalEntityId === le.id,
          })),
        ]}
      />

      {/* Pendientes de hoy (solo Administrador) */}
      {!props.isOwnerView ? (
        <div className="flex flex-col gap-1 rounded-[14px] bg-primary p-4 text-primary-foreground">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">
            Pendientes de hoy
          </div>
          {[
            {
              n: props.pending.porCobrar,
              text: "rentas por cobrar este mes",
              href: "/collections?filtro=por-cobrar",
            },
            {
              n: props.pending.avisosSinEnviar,
              text: "avisos de morosidad sin enviar",
              href: "/collections?seg=morosidad",
            },
            {
              n: props.pending.mantenimientosAtrasados,
              text: props.pending.mantenimientosAtrasados === 1 ? "mantenimiento atrasado" : "mantenimientos atrasados",
              href: "/mantenimientos",
            },
          ].map((row, i, arr) => (
            <Link
              key={row.href}
              href={row.href}
              className={cn(
                "flex items-center justify-between py-[9px]",
                i < arr.length - 1 && "border-b border-[rgba(240,246,247,.14)]",
              )}
            >
              <span className="text-[15px]">
                <b className="font-semibold">{row.n}</b> {row.text}
              </span>
              <ChevronRight className="size-4 opacity-60" />
            </Link>
          ))}
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard label="Ventas con IVA" icon={TrendingUp} value={formatMXN(kpis.ventas)} sub="Ingresos cobrados" />
        <KpiCard label="Costo de Operación" icon={TrendingDown} value={formatMXN(kpis.egresos)} sub="Egresos pagados" />
        <MobileCard
          className={cn(
            "col-span-2 flex items-center justify-between gap-2.5 p-3.5",
            kpis.utilidad >= 0
              ? "shadow-[0_0_0_1px_rgba(16,185,129,.25)]"
              : "shadow-[0_0_0_1px_rgba(244,63,94,.3)]",
          )}
        >
          <div className="flex flex-col gap-1.5">
            <MobileKpiLabel>Utilidad Bruta</MobileKpiLabel>
            <div className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums">
              {formatMXN(kpis.utilidad)}
            </div>
          </div>
          <div className="text-right">
            <div
              className={cn(
                "text-xl font-semibold tabular-nums",
                kpis.utilidad >= 0 ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {formatPercent(kpis.rentabilidad)}
            </div>
            <div className="text-[11.5px] text-muted-foreground">Rentabilidad</div>
          </div>
        </MobileCard>
      </div>

      {/* Cobranza del mes */}
      <Link href="/collections">
        <MobileCard className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <MobileSectionTitle>Cobranza — {props.monthLabel}</MobileSectionTitle>
            <span className={cn("text-[30px] font-bold tabular-nums", tone.text)}>{cobranza.pct}%</span>
          </div>
          <MobileProgress pct={cobranza.pct} barClassName={tone.bar} height="h-2.5" ringed />
          <div className="text-xs text-muted-foreground">
            {formatMXN(cobranza.collected)} cobrados de {formatMXN(cobranza.expected)} esperados
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {[
              { n: cobranza.paid, label: "Pagado", cls: "text-emerald-600" },
              { n: cobranza.partial, label: "Parcial", cls: "text-amber-600" },
              { n: cobranza.pending, label: "Pendiente", cls: "" },
              { n: cobranza.overdue, label: "Vencido", cls: "text-rose-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-[10px] border border-border px-0.5 py-2">
                <div className={cn("font-semibold tabular-nums", s.cls)}>{s.n}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </MobileCard>
      </Link>

      {/* Alertas */}
      <MobileCard className="flex flex-col gap-2.5 p-4">
        <MobileSectionTitle>Alertas</MobileSectionTitle>
        {props.alerts.length > 0 ? (
          props.alerts.map((a) => (
            <div
              key={a.message}
              className={cn(
                "flex items-start gap-2.5 rounded-[10px] px-3 py-[11px] text-[13.5px] leading-[1.35]",
                a.level === "critical" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800",
              )}
            >
              <AlertCircle
                className={cn(
                  "mt-px size-4 shrink-0",
                  a.level === "critical" ? "text-rose-500" : "text-amber-500",
                )}
              />
              <span>{a.message}</span>
            </div>
          ))
        ) : (
          <div className="rounded-[10px] bg-emerald-50 px-3 py-[11px] text-[13.5px] text-emerald-700">
            Todo en orden · no hay alertas activas
          </div>
        )}
      </MobileCard>

      {/* Inquilinos con Adeudo */}
      <MobileCard className="flex flex-col gap-1 px-2.5 pt-4 pb-2.5">
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <MobileSectionTitle>Inquilinos con Adeudo</MobileSectionTitle>
          <Link href="/collections?seg=morosidad" className="text-[13px] font-medium text-primary">
            Ver todo
          </Link>
        </div>
        {props.topOverdue.length > 0 ? (
          props.topOverdue.map((r) => {
            const pill = overduePill(r.worstStatus);
            return (
              <Link
                key={r.lesseeId}
                href={withOrigin(`/lessees/${r.lesseeId}`, "inicio")}
                className="flex items-center gap-2.5 rounded-lg px-1.5 py-[9px] active:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.legalName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.unitLabel} · {r.count} {r.count === 1 ? "renta" : "rentas"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-[3px]">
                  <span className="text-sm font-semibold text-rose-600 tabular-nums">{formatMXN(r.total)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", pill.className)}>
                    {pill.label}
                  </span>
                </div>
              </Link>
            );
          })
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">Sin adeudos activos</p>
        )}
      </MobileCard>

      {/* Por Razón Social (solo Dueño) */}
      {props.isOwnerView ? (
        <MobileCard className="flex flex-col gap-1 p-4">
          <MobileSectionTitle className="mb-2">Por Razón Social — {props.periodLabel}</MobileSectionTitle>
          <div className="grid grid-cols-[44px_1fr_1fr_48px] gap-1.5 border-b border-border pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
            <span />
            <span className="text-right">Ingresos</span>
            <span className="text-right">Utilidad</span>
            <span className="text-right">Rent.</span>
          </div>
          {props.byLegalEntity.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-[44px_1fr_1fr_48px] gap-1.5 border-b border-muted py-2 text-[13px] tabular-nums last:border-b-0"
            >
              <span className="font-semibold">{l.code}</span>
              <span className="text-right">{formatMXN(l.income)}</span>
              <span className={cn("text-right", l.profit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {formatMXN(l.profit)}
              </span>
              <span className="text-right text-muted-foreground">{formatPercent(l.rent, 0)}</span>
            </div>
          ))}
        </MobileCard>
      ) : null}

      {/* Renta Mensual Esperada */}
      <MobileCard className="flex flex-col gap-3.5 p-4">
        <MobileSectionTitle>Renta Mensual Esperada</MobileSectionTitle>
        {props.ranking.length > 0 ? (
          props.ranking.map((p) => (
            <Link key={p.id} href={withOrigin(`/plazas/${p.id}`, "inicio")} className="flex flex-col gap-[5px]">
              <div className="flex justify-between gap-2 text-[13.5px]">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatMXN(p.expectedMonthly)}</span>
              </div>
              <MobileProgress
                pct={(p.expectedMonthly / maxExpected) * 100}
                barClassName="bg-primary"
                height="h-1.5"
              />
              <span className="text-xs text-muted-foreground">
                {p.rentedUnits}/{p.totalUnits} ocupados
              </span>
            </Link>
          ))
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">Sin contratos activos</p>
        )}
      </MobileCard>
    </MobileScreen>
  );
}

function KpiCard({
  label,
  icon: Icon,
  value,
  sub,
}: {
  label: string;
  icon: typeof TrendingUp;
  value: string;
  sub: string;
}) {
  return (
    <MobileCard className="flex min-w-0 flex-col gap-1.5 p-3.5">
      <div className="flex items-center justify-between text-muted-foreground">
        <MobileKpiLabel>{label}</MobileKpiLabel>
        <Icon className="size-[15px]" />
      </div>
      <div className="truncate text-[19px] font-semibold tracking-[-0.01em] tabular-nums">{value}</div>
      <div className="text-[11.5px] text-muted-foreground">{sub}</div>
    </MobileCard>
  );
}
