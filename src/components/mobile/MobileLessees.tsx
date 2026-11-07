"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  MobileBackLink,
  MobileCard,
  MobileEmpty,
  MobileListLink,
  MobilePageHeader,
  MobileScreen,
  rentStatusDot,
} from "@/components/mobile/MobileUI";
import { initials } from "@/shared/mobile/format";
import { withOrigin } from "@/shared/mobile/nav";
import type { MobileLesseeListItem } from "@/server/services/mobile-queries";
import { cn } from "@/shared/utils";

/** Inquilinos con buscador por nombre o código de local (handoff §7). */
export function MobileLessees({ lessees }: { lessees: MobileLesseeListItem[] }) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lessees;
    return lessees.filter(
      (l) =>
        l.legalName.toLowerCase().includes(q) ||
        l.unitCodes.some((c) => c.toLowerCase().includes(q)),
    );
  }, [lessees, query]);

  return (
    <MobileScreen>
      <MobileBackLink href="/mas" label="Más" />
      <MobilePageHeader size="md" title="Inquilinos" subtitle={`${lessees.length} activos`} />

      <label className="flex h-10 items-center gap-2 rounded-[10px] bg-card px-3 shadow-[0_0_0_1px_rgba(11,14,41,.08)]">
        <Search className="size-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar inquilino o local"
          aria-label="Buscar inquilino o local"
          className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </label>

      <MobileCard className="overflow-hidden">
        {visible.map((l) => (
          <MobileListLink key={l.id} href={withOrigin(`/lessees/${l.id}`, "inquilinos")}>
            <span className="flex size-9 flex-none items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
              {initials(l.legalName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{l.legalName}</span>
              <span className="block truncate text-xs text-muted-foreground">{l.location}</span>
            </span>
            <span className={cn("size-2 flex-none rounded-full", rentStatusDot(l.monthStatus))} />
          </MobileListLink>
        ))}
        {visible.length === 0 ? <MobileEmpty>Sin resultados</MobileEmpty> : null}
      </MobileCard>
    </MobileScreen>
  );
}
