"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
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
import { LesseeForm } from "@/components/forms/LesseeForm";
import { TenantCard } from "@/components/lessees/TenantCard";
import type { LesseeListItem } from "@/lib/services/lessees-queries";
import type { PropertyType } from "@/generated/prisma/enums";

interface LesseeTableProps {
  lessees: ReadonlyArray<LesseeListItem>;
}

type LesseeGroup = {
  key: string;
  label: string;
  /** "plaza" para PLAZA_COMERCIAL, "inmueble" para los demás, "none" para sin contrato activo. */
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
    return lessees.filter((l) => {
      return (
        l.legalName.toLowerCase().includes(q) ||
        (l.contactName?.toLowerCase().includes(q) ?? false) ||
        (l.rfc?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [lessees, search]);

  const grouped = useMemo<LesseeGroup[]>(() => {
    const map = new Map<string, LesseeGroup>();
    for (const l of filtered) {
      if (l.properties.length === 0) {
        const key = "__none__";
        if (!map.has(key)) {
          map.set(key, {
            key,
            label: "Sin contrato activo",
            kind: "none",
            lessees: [],
          });
        }
        map.get(key)!.lessees.push(l);
      } else {
        for (const p of l.properties) {
          if (!map.has(p.id)) {
            map.set(p.id, {
              key: p.id,
              label: p.name,
              kind: kindFromType(p.type),
              lessees: [],
            });
          }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por razón social, contacto o RFC..."
          className="w-full sm:max-w-sm"
        />
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

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No hay inquilinos registrados.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <section key={group.key} className="space-y-3">
                <GroupHeader
                  group={group}
                  collapsed={isCollapsed}
                  onToggle={() => toggleCollapsed(group.key)}
                />
                {!isCollapsed ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {group.lessees.map((lessee) => (
                      <TenantCard key={lessee.id} lessee={lessee} />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function GroupHeader({
  group,
  collapsed,
  onToggle,
}: {
  group: LesseeGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const tagLabel =
    group.kind === "plaza" ? "Plaza" : group.kind === "inmueble" ? "Inmueble" : null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition hover:bg-muted/50"
    >
      {collapsed ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      )}
      {tagLabel ? (
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {tagLabel}
        </Badge>
      ) : null}
      <h3 className="text-base font-semibold tracking-tight">{group.label}</h3>
      <span className="text-xs text-muted-foreground">
        {group.lessees.length} inquilino{group.lessees.length === 1 ? "" : "s"}
      </span>
    </button>
  );
}
