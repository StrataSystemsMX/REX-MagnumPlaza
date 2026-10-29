import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { communicationChannelLabel } from "@/shared/i18n/enums";
import { cn } from "@/shared/utils";
import type { LesseeListItem } from "@/server/services/lessees-queries";

interface TenantCardProps {
  lessee: LesseeListItem;
}

function getInitials(name: string): string {
  const words = name
    .replace(/\b(SA|SC|SAS|SRL|SDE|RL|CV|de|DE)\b\.?/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("") || name.slice(0, 2).toUpperCase();
}

export function TenantCard({ lessee }: TenantCardProps) {
  const initials = getInitials(lessee.legalName);
  const subtitle = lessee.contactName ?? lessee.rfc ?? "Sin contacto registrado";
  const contracts = lessee.activeContractsCount;

  return (
    <Link
      href={`/lessees/${lessee.id}`}
      className="group block focus-visible:outline-none"
    >
      <div
        className={cn(
          "grid grid-cols-[100px_1fr] overflow-hidden rounded-xl bg-card",
          "ring-1 ring-foreground/10 transition",
          "group-hover:ring-2 group-hover:ring-primary/30",
          "group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
        )}
      >
        <div className="flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 font-mono text-2xl font-semibold tracking-tight text-slate-500">
          {initials}
        </div>

        <div className="flex flex-col gap-1 px-3.5 py-3">
          <div className="text-sm font-medium leading-tight">
            {lessee.legalName}
          </div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>

          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                Contratos activos
              </div>
              <div className="text-lg font-semibold tabular-nums tracking-tight">
                {contracts}
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {communicationChannelLabel(lessee.preferredChannel)}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
}
