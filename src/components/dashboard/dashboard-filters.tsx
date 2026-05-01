"use client";

import { RefreshCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface LegalEntityOption {
  id: string;
  code: string;
  legalName: string;
}

export interface DashboardFiltersProps {
  currentMonth: string;
  currentLegalEntity: string;
  monthOptions: Array<{ value: string; label: string }>;
  legalEntities: LegalEntityOption[];
  /** Indica si el usuario puede ver el filtro de LegalEntity (no aplica a ADMIN). */
  canSeeLegalEntityFilter: boolean;
}

export function DashboardFilters({
  currentMonth,
  currentLegalEntity,
  monthOptions,
  legalEntities,
  canSeeLegalEntityFilter,
}: DashboardFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (!value || value === "all" || value === "") params.delete(key);
    else params.set(key, value);
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={currentMonth} onValueChange={(v) => setParam("month", v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Mes" />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {canSeeLegalEntityFilter ? (
        <Select
          value={currentLegalEntity}
          onValueChange={(v) => setParam("legalEntity", v)}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Razón social" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las razones</SelectItem>
            {legalEntities.map((le) => (
              <SelectItem key={le.id} value={le.id}>
                {le.code} — {le.legalName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        onClick={refresh}
        disabled={isPending}
      >
        <RefreshCcw className="size-4" />
        Actualizar
      </Button>
    </div>
  );
}
