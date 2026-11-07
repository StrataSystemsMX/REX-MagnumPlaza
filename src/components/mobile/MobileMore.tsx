import { FileText, LogOut, TrendingDown, Users, Wrench } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { ViewSwitchButton } from "@/components/mobile/ViewSwitchButton";
import {
  MobileCard,
  MobileListLink,
  MobilePageHeader,
  MobilePill,
  MobileScreen,
} from "@/components/mobile/MobileUI";
import { formatMXN } from "@/shared/format-currency";
import { initials } from "@/shared/mobile/format";

/** Menú secundario (handoff §5). */
export function MobileMore({
  userName,
  roleLabel,
  tenantName,
  counts,
}: {
  userName: string;
  roleLabel: string;
  tenantName: string;
  counts: {
    contractsToRenew: number;
    lessees: number;
    overdueMaintenances: number;
    monthExpensesTotal: number;
  };
}) {
  return (
    <MobileScreen className="gap-4">
      <MobilePageHeader title="Más" />

      <Group title="Operación">
        <Row href="/contracts" icon={FileText} label="Contratos">
          {counts.contractsToRenew > 0 ? (
            <MobilePill className="bg-[oklch(0.96_0.03_85)] text-warning">
              {counts.contractsToRenew} por renovar
            </MobilePill>
          ) : null}
        </Row>
        <Row href="/lessees" icon={Users} label="Inquilinos">
          <span className="text-[13px] text-muted-foreground">{counts.lessees}</span>
        </Row>
        <Row href="/mantenimientos" icon={Wrench} label="Mantenimientos">
          {counts.overdueMaintenances > 0 ? (
            <MobilePill className="bg-red-100 text-red-700">
              {counts.overdueMaintenances} atrasado{counts.overdueMaintenances === 1 ? "" : "s"}
            </MobilePill>
          ) : null}
        </Row>
      </Group>

      <Group title="Administración">
        <Row href="/egresos" icon={TrendingDown} label="Egresos">
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {formatMXN(counts.monthExpensesTotal)}
          </span>
        </Row>
      </Group>

      <MobileCard className="flex items-center gap-3 p-4">
        <span className="flex size-10 flex-none items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {initials(userName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{userName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {roleLabel} · {tenantName}
          </span>
        </span>
        <SignOutButton>
          <button
            type="button"
            aria-label="Cerrar sesión"
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <LogOut className="size-5" />
          </button>
        </SignOutButton>
      </MobileCard>

      <ViewSwitchButton
        to="desktop"
        className="self-center rounded-full px-3 py-2 text-[13px] font-medium text-primary"
      />

      <p className="text-center text-[10px] text-muted-foreground/60">powered by Strata Systems MX</p>
    </MobileScreen>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <MobileCard className="overflow-hidden">
      <div className="px-4 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </div>
      {children}
    </MobileCard>
  );
}

function Row({
  href,
  icon: Icon,
  label,
  children,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  children?: ReactNode;
}) {
  return (
    <MobileListLink href={href} chevron className="px-4">
      <Icon className="size-5 text-primary" />
      <span className="flex-1 text-[15px]">{label}</span>
      {children}
    </MobileListLink>
  );
}
