import {
  MobileBackLink,
  MobileCard,
  MobileEmpty,
  MobileListLink,
  MobilePageHeader,
  MobilePill,
  MobileScreen,
  MobileSegmentedLinks,
  contractPill,
} from "@/components/mobile/MobileUI";
import { formatMXN } from "@/shared/format-currency";
import { formatDate } from "@/shared/format-date";
import { shortPropertyName } from "@/shared/mobile/format";
import { withOrigin } from "@/shared/mobile/nav";
import type { ContractListItem } from "@/server/services/contracts-queries";

export type ContractsSegment = "activos" | "por-renovar" | "todos";

/** Contratos: Activos | Por renovar | Todos (handoff §6). */
export function MobileContracts({
  contracts,
  segment,
}: {
  contracts: ContractListItem[];
  segment: ContractsSegment;
}) {
  const toRenew = (c: ContractListItem) => contractPill(c).label === "Por renovar";
  const visible = contracts.filter((c) =>
    segment === "activos" ? c.status === "ACTIVE" : segment === "por-renovar" ? toRenew(c) : true,
  );

  return (
    <MobileScreen>
      <MobileBackLink href="/mas" label="Más" />
      <MobilePageHeader size="md" title="Contratos" subtitle={`${contracts.length} en total`} />

      <MobileSegmentedLinks
        fullWidth
        options={[
          { label: "Activos", href: "/contracts", active: segment === "activos" },
          {
            label: `Por renovar (${contracts.filter(toRenew).length})`,
            href: "/contracts?seg=por-renovar",
            active: segment === "por-renovar",
          },
          { label: "Todos", href: "/contracts?seg=todos", active: segment === "todos" },
        ]}
      />

      <MobileCard className="overflow-hidden">
        {visible.map((c) => {
          const pill = contractPill(c);
          return (
            <MobileListLink key={c.id} href={withOrigin(`/lessees/${c.lessee.id}`, "contratos")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.lessee.legalName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {shortPropertyName(c.unit.property.name)} {c.unit.code} · vence {formatDate(c.endDate)}
                </span>
              </span>
              <span className="flex flex-none flex-col items-end gap-1">
                <span className="text-sm font-semibold tabular-nums">{formatMXN(c.monthlyAmount)}</span>
                <MobilePill className={pill.className}>{pill.label}</MobilePill>
              </span>
            </MobileListLink>
          );
        })}
        {visible.length === 0 ? <MobileEmpty>Sin contratos en este filtro</MobileEmpty> : null}
      </MobileCard>
    </MobileScreen>
  );
}
