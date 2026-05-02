"use client";

import { Check, ChevronDown } from "lucide-react";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { actionSetActiveLegalEntity } from "@/lib/services/active-legal-entity-actions";
import { cn } from "@/lib/utils";

interface LegalEntityOption {
  id: string;
  code: string;
  legalName: string;
}

interface LegalEntitySwitcherProps {
  tenantName: string;
  entities: LegalEntityOption[];
  activeEntityId: string | null;
}

export function LegalEntitySwitcher({
  tenantName,
  entities,
  activeEntityId,
}: LegalEntitySwitcherProps) {
  const [isPending, startTransition] = useTransition();

  const active = entities.find((e) => e.id === activeEntityId) ?? null;
  const triggerLabel = active ? active.code : "Todas";
  const triggerSub = active ? active.legalName : tenantName;

  function select(id: string | null) {
    startTransition(async () => {
      await actionSetActiveLegalEntity(id);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className={cn(
          "flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:opacity-60",
        )}
      >
        <span className="text-muted-foreground">Razón social:</span>
        <span className="font-medium">{triggerLabel}</span>
        <span className="hidden text-xs text-muted-foreground md:inline">
          · {triggerSub}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Filtrar vista por razón social</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => select(null)}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col">
              <span className="font-medium">Todas</span>
              <span className="text-xs text-muted-foreground">
                Vista consolidada · {tenantName}
              </span>
            </div>
            {activeEntityId === null ? <Check className="size-4 text-primary" /> : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {entities.map((e) => (
            <DropdownMenuItem
              key={e.id}
              onClick={() => select(e.id)}
              className="flex items-center justify-between"
            >
              <div className="flex flex-col">
                <span className="font-medium">{e.code}</span>
                <span className="text-xs text-muted-foreground">{e.legalName}</span>
              </div>
              {activeEntityId === e.id ? <Check className="size-4 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
