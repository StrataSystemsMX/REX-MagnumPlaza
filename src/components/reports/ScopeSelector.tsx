"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Building2, ChevronLeft, ChevronRight, Layers, MapPin, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ScopeType = "tenant" | "entity" | "property" | "unit" | "detail";

export interface LegalEntityOption {
  id: string;
  code: string;
  legalName: string;
}

export interface PropertyOption {
  id: string;
  name: string;
  type: string;
}

export interface UnitOption {
  id: string;
  code: string;
  name: string | null;
  propertyName: string;
}

interface Props {
  legalEntities: LegalEntityOption[];
  properties: PropertyOption[];
  units: UnitOption[];
  year: number;
  availableYears: number[];
}

const SCOPE_TYPES: { type: ScopeType; label: string; icon: typeof Layers }[] = [
  { type: "tenant", label: "Portafolio", icon: Layers },
  { type: "entity", label: "Razón social", icon: Building2 },
  { type: "property", label: "Inmueble", icon: MapPin },
  { type: "unit", label: "Local", icon: Store },
  { type: "detail", label: "Análisis detallado", icon: BarChart3 },
];

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  PLAZA_COMERCIAL: "Plaza comercial",
  TERRENO_RENTADO: "Terreno rentado",
  EDIFICIO: "Edificio",
  OFICINA: "Oficina",
  CASA: "Casa",
  BODEGA: "Bodega",
  LOCAL_INDEPENDIENTE: "Local independiente",
  ESPECTACULAR: "Espectacular",
};

export function ScopeSelector({ legalEntities, properties, units, year, availableYears }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const scopeType = (params.get("scope") ?? "tenant") as ScopeType;
  const currentId = params.get("id") ?? undefined;
  const currentMonth = Number(params.get("month")) || undefined;

  function buildParams(type: ScopeType, id?: string, y?: number, month?: number) {
    const p = new URLSearchParams();
    p.set("scope", type);
    p.set("year", String(y ?? year));
    if (month) p.set("month", String(month));
    if (id) p.set("id", id);
    return p.toString();
  }

  function navigate(type: ScopeType, id?: string) {
    router.push(`/reportes?${buildParams(type, id, year, currentMonth)}`);
  }

  function setMonth(month: number | undefined) {
    router.push(`/reportes?${buildParams(scopeType, currentId, year, month)}`);
  }

  function changeYear(delta: number) {
    const newYear = year + delta;
    const minYear = availableYears[availableYears.length - 1] ?? year;
    const maxYear = availableYears[0] ?? year;
    if (newYear < minYear || newYear > maxYear) return;
    router.push(`/reportes?${buildParams(scopeType, currentId, newYear, currentMonth)}`);
  }

  const minYear = availableYears[availableYears.length - 1] ?? year;
  const maxYear = availableYears[0] ?? year;

  return (
    <div className="space-y-4">
      {/* Scope type buttons + year/month navigation */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {SCOPE_TYPES.map(({ type, label, icon: Icon }) => (
            <Button
              key={type}
              variant={scopeType === type ? "default" : "outline"}
              size="sm"
              onClick={() => navigate(type)}
              className="h-8 gap-1.5 text-xs"
            >
              <Icon className="size-3.5" />
              {label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {/* Year */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost" size="icon" className="size-7"
              onClick={() => changeYear(-1)}
              disabled={year <= minYear}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="w-12 text-center text-sm font-semibold tabular-nums">{year}</span>
            <Button
              variant="ghost" size="icon" className="size-7"
              onClick={() => changeYear(1)}
              disabled={year >= maxYear}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>

          {/* Month pills */}
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              variant={!currentMonth ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setMonth(undefined)}
            >
              Año
            </Button>
            {MONTHS.map((m, i) => (
              <Button
                key={i}
                variant={currentMonth === i + 1 ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setMonth(i + 1)}
              >
                {m}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Entity cards */}
      {scopeType === "entity" && (
        <div className="flex flex-wrap gap-2">
          {legalEntities.map((e) => (
            <button
              key={e.id}
              onClick={() => navigate("entity", e.id)}
              className={cn(
                "rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/60",
                currentId === e.id ? "border-primary bg-primary/5 shadow-sm" : "border-border",
              )}
            >
              <p className="text-base font-bold leading-none">{e.code}</p>
              <p className="mt-1 max-w-[160px] text-xs leading-snug text-muted-foreground">
                {e.legalName}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Property cards */}
      {scopeType === "property" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {properties.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate("property", p.id)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                currentId === p.id ? "border-primary bg-primary/5 shadow-sm" : "border-border",
              )}
            >
              <p className="text-xs font-semibold leading-snug">{p.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {PROPERTY_TYPE_LABELS[p.type] ?? p.type}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Unit cards */}
      {scopeType === "unit" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => navigate("unit", u.id)}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/60",
                currentId === u.id ? "border-primary bg-primary/5 shadow-sm" : "border-border",
              )}
            >
              <p className="text-xs font-bold leading-none">{u.code}</p>
              {u.name && <p className="mt-0.5 text-xs leading-snug">{u.name}</p>}
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{u.propertyName}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
