"use client";

import { Building2, ChevronDown, ChevronRight, Plus, Search, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LesseeForm } from "@/components/forms/LesseeForm";
import { communicationChannelLabel } from "@/lib/i18n/enums";
import type { LesseeListItem } from "@/lib/services/lessees-queries";
import type { PropertyType } from "@/generated/prisma/enums";

const TABLE_COLUMN_COUNT = 4;

interface LesseeTableProps {
  lessees: ReadonlyArray<LesseeListItem>;
}

type LesseeGroup = {
  key: string;
  label: string;
  kind: "plaza" | "inmueble" | "none";
  lessees: LesseeListItem[];
};

function groupRank(kind: LesseeGroup["kind"]) {
  if (kind === "plaza") return 0;
  if (kind === "inmueble") return 1;
  return 2;
}

function kindFromType(type: PropertyType): "plaza" | "inmueble" {
  return type === "PLAZA_COMERCIAL" ? "plaza" : "inmueble";
}

export function LesseeTable({ lessees }: LesseeTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lessees;
    return lessees.filter(
      (l) =>
        l.legalName.toLowerCase().includes(q) ||
        (l.contactName?.toLowerCase().includes(q) ?? false) ||
        (l.rfc?.toLowerCase().includes(q) ?? false),
    );
  }, [lessees, search]);

  const grouped = useMemo<LesseeGroup[]>(() => {
    const map = new Map<string, LesseeGroup>();
    for (const l of filtered) {
      if (l.properties.length === 0) {
        const key = "__none__";
        if (!map.has(key))
          map.set(key, { key, label: "Sin contrato activo", kind: "none", lessees: [] });
        map.get(key)!.lessees.push(l);
      } else {
        for (const p of l.properties) {
          if (!map.has(p.id))
            map.set(p.id, { key: p.id, label: p.name, kind: kindFromType(p.type), lessees: [] });
          map.get(p.id)!.lessees.push(l);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const rankDiff = groupRank(a.kind) - groupRank(b.kind);
      if (rankDiff !== 0) return rankDiff;
      return a.label.localeCompare(b.label, "es");
    });
  }, [filtered]);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar razón social, RFC..."
            className="pl-8"
          />
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nuevo inquilino
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nuevo inquilino</DialogTitle>
              <DialogDescription>
                Captura los datos del inquilino. Después podrás vincularlo a contratos.
              </DialogDescription>
            </DialogHeader>
            <LesseeForm
              onSuccess={() => {
                setCreateOpen(false);
                router.refresh();
              }}
              submitLabel="Crear inquilino"
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Usamos una <table> cruda (no el componente Table de shadcn) porque ese
          envuelve la tabla en un div con overflow-x-auto, y ese contenedor de
          scroll atrapa el `sticky` (se ancla al div, no al scroll de la página).
          overflow-clip recorta las esquinas redondeadas SIN crear contenedor de
          scroll, así que conserva el sticky relativo al <main>. */}
      <div className="overflow-clip rounded-lg border bg-card">
        <table className="w-full min-w-[640px] caption-bottom text-sm">
          {/* El scroll vive en <main>, con padding superior (p-4/6/8). El offset de
              `sticky` se mide desde el borde de contenido (tras el padding), así que
              `top-0` dejaría una franja donde se asoman las filas; el top negativo
              iguala ese padding para anclar el encabezado al borde superior real.
              (Acoplado al padding de (dashboard)/layout.tsx.) */}
          <TableHeader className="sticky -top-4 z-20 sm:-top-6 lg:-top-8">
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Inquilino
              </TableHead>
              <TableHead className="bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-xs font-medium uppercase tracking-wide text-muted-foreground">
                RFC
              </TableHead>
              <TableHead className="bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-xs font-medium uppercase tracking-wide text-muted-foreground text-center">
                Contratos activos
              </TableHead>
              <TableHead className="bg-card shadow-[inset_0_-1px_0_0_var(--border)] text-xs font-medium uppercase tracking-wide text-muted-foreground text-center">
                Canal
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No hay inquilinos para los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              grouped.map((group) => (
                <LesseeGroupRows
                  key={group.key}
                  group={group}
                  isCollapsed={collapsed.has(group.key)}
                  onToggle={() => toggleCollapsed(group.key)}
                  onRowClick={(id) => router.push(`/lessees/${id}`)}
                  onRowPrefetch={(id) => router.prefetch(`/lessees/${id}`)}
                />
              ))
            )}
          </TableBody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length === lessees.length
          ? `${lessees.length} inquilino${lessees.length === 1 ? "" : "s"}`
          : `${filtered.length} de ${lessees.length} inquilino${lessees.length === 1 ? "" : "s"}`}
      </p>
    </>
  );
}

interface LesseeGroupRowsProps {
  group: LesseeGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  onRowClick: (id: string) => void;
  onRowPrefetch: (id: string) => void;
}

function LesseeGroupRows({
  group,
  isCollapsed,
  onToggle,
  onRowClick,
  onRowPrefetch,
}: LesseeGroupRowsProps) {
  const Icon = group.kind === "plaza" ? Store : Building2;
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;
  const groupLabel =
    group.kind === "plaza" ? "Plaza" : group.kind === "inmueble" ? "Inmueble" : null;

  return (
    <>
      <TableRow
        className="bg-muted/40 hover:bg-muted/60 cursor-pointer"
        onClick={onToggle}
      >
        <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-2">
          <div className="flex items-center gap-2">
            <Chevron className="size-4 text-muted-foreground" />
            {group.kind !== "none" && <Icon className="size-4 text-muted-foreground" />}
            <span className="font-medium">{group.label}</span>
            {groupLabel && (
              <Badge variant="outline" className="text-[10px]">
                {groupLabel}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {group.lessees.length} inquilino{group.lessees.length === 1 ? "" : "s"}
            </span>
          </div>
        </TableCell>
      </TableRow>
      {!isCollapsed &&
        group.lessees.map((l) => (
          <TableRow
            key={l.id}
            tabIndex={0}
            role="link"
            aria-label={`Ver inquilino ${l.legalName}`}
            className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
            onClick={() => onRowClick(l.id)}
            onMouseEnter={() => onRowPrefetch(l.id)}
            onFocus={() => onRowPrefetch(l.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick(l.id);
              }
            }}
          >
            <TableCell className="py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.legalName}</p>
                {l.contactName && (
                  <p className="truncate text-xs text-muted-foreground">{l.contactName}</p>
                )}
              </div>
            </TableCell>
            <TableCell className="py-3">
              <span className="font-mono text-xs text-muted-foreground">
                {l.rfc ?? "—"}
              </span>
            </TableCell>
            <TableCell className="py-3 text-center tabular-nums">
              {l.activeContractsCount}
            </TableCell>
            <TableCell className="py-3 text-center">
              <Badge variant="secondary">
                {communicationChannelLabel(l.preferredChannel)}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
    </>
  );
}
