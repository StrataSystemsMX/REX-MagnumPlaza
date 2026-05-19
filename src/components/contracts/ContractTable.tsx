"use client";

import { Building2, ChevronDown, ChevronRight, Plus, Search, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContractWizard } from "@/components/contracts/ContractWizard";
import {
  contractStatusLabel,
  contractStatusVariant,
  contractTypeLabel,
} from "@/lib/i18n/enums";
import type {
  AvailableUnit,
  ContractListItem,
} from "@/lib/services/contracts-queries";
import type { ContractStatus, PropertyType } from "@/generated/prisma/enums";
import { capitalizeFirst, cn } from "@/lib/utils";

type StatusFilter = ContractStatus | "ALL";
type ExpiryFilter = "ALL" | "30" | "60" | "90";

const STATUSES: ReadonlyArray<ContractStatus> = [
  "DRAFT",
  "ACTIVE",
  "PENDING_RENEWAL",
  "EXPIRED",
  "TERMINATED",
  "CANCELLED",
];

const statusFilterItems: Record<string, string> = {
  ALL: "Todos los estados",
  ...Object.fromEntries(STATUSES.map((s) => [s, contractStatusLabel(s)])),
};

const expiryFilterItems: Record<string, string> = {
  ALL: "Todos los vencimientos",
  "30": "Vence en ≤ 30 días",
  "60": "Vence en ≤ 60 días",
  "90": "Vence en ≤ 90 días",
};

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

const TABLE_COLUMN_COUNT = 5;

interface ContractTableProps {
  contracts: ReadonlyArray<ContractListItem>;
  availableUnits: ReadonlyArray<AvailableUnit>;
}

interface PropertyGroup {
  propertyId: string;
  propertyName: string;
  propertyType: PropertyType;
  isPlaza: boolean;
  contracts: ContractListItem[];
}

function groupByProperty(items: ReadonlyArray<ContractListItem>): PropertyGroup[] {
  const groups = new Map<string, PropertyGroup>();
  for (const c of items) {
    const key = c.unit.property.id;
    const existing = groups.get(key);
    if (existing) {
      existing.contracts.push(c);
    } else {
      groups.set(key, {
        propertyId: key,
        propertyName: c.unit.property.name,
        propertyType: c.unit.property.type,
        isPlaza: c.unit.property.type === "PLAZA_COMERCIAL",
        contracts: [c],
      });
    }
  }
  // Plazas primero, luego inmuebles; ambos alfabéticos.
  return Array.from(groups.values()).sort((a, b) => {
    if (a.isPlaza !== b.isPlaza) return a.isPlaza ? -1 : 1;
    return a.propertyName.localeCompare(b.propertyName, "es");
  });
}

export function ContractTable({ contracts, availableUnits }: ContractTableProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (expiryFilter !== "ALL") {
        const days = Number(expiryFilter);
        if (c.daysToExpire < 0 || c.daysToExpire > days) return false;
      }
      if (q) {
        const hay =
          c.lessee.legalName +
          " " +
          (c.lessee.contactName ?? "") +
          " " +
          c.unit.property.name +
          " " +
          c.unit.code +
          " " +
          (c.unit.name ?? "") +
          " " +
          c.id.slice(-8);
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [contracts, statusFilter, expiryFilter, search]);

  const groups = useMemo(() => groupByProperty(filtered), [filtered]);

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar inquilino, unidad o ID..."
              className="pl-8"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            items={statusFilterItems}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusFilterItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={expiryFilter}
            onValueChange={(v) => setExpiryFilter(v as ExpiryFilter)}
            items={expiryFilterItems}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Vencimiento" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(expiryFilterItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
          <Plus className="size-4" />
          Nuevo contrato
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Inquilino
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-center">
                Vigencia
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-right">
                Renta
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-center">
                Estado
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-center">
                Vence
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No hay contratos para los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group) => {
                const isCollapsed = collapsed.has(group.propertyId);
                const Icon = group.isPlaza ? Store : Building2;
                return (
                  <PropertyGroupRows
                    key={group.propertyId}
                    group={group}
                    isCollapsed={isCollapsed}
                    Icon={Icon}
                    onToggle={() => toggleGroup(group.propertyId)}
                    onRowClick={(id) => router.push(`/contracts/${id}`)}
                    onRowPrefetch={(id) => router.prefetch(`/contracts/${id}`)}
                  />
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length === contracts.length
          ? `${contracts.length} contratos en ${groups.length} ${groups.length === 1 ? "inmueble" : "inmuebles"}`
          : `${filtered.length} de ${contracts.length} contratos en ${groups.length} ${groups.length === 1 ? "inmueble" : "inmuebles"}`}
      </p>

      <ContractWizard
        availableUnits={availableUnits}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />
    </>
  );
}

interface PropertyGroupRowsProps {
  group: PropertyGroup;
  isCollapsed: boolean;
  Icon: typeof Store;
  onToggle: () => void;
  onRowClick: (contractId: string) => void;
  onRowPrefetch: (contractId: string) => void;
}

function PropertyGroupRows({
  group,
  isCollapsed,
  Icon,
  onToggle,
  onRowClick,
  onRowPrefetch,
}: PropertyGroupRowsProps) {
  const groupLabel = group.isPlaza ? "Plaza" : "Inmueble";
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;

  return (
    <>
      <TableRow
        className="bg-muted/40 hover:bg-muted/60 cursor-pointer"
        onClick={onToggle}
      >
        <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-2">
          <div className="flex items-center gap-2">
            <Chevron className="size-4 text-muted-foreground" />
            <Icon className="size-4 text-muted-foreground" />
            <span className="font-medium">{group.propertyName}</span>
            <Badge variant="outline" className="text-[10px]">
              {groupLabel}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">
              {group.contracts.length} {group.contracts.length === 1 ? "contrato" : "contratos"}
            </span>
          </div>
        </TableCell>
      </TableRow>
      {!isCollapsed &&
        group.contracts.map((c) => (
          <TableRow
            key={c.id}
            tabIndex={0}
            role="link"
            aria-label={`Ver contrato ${c.id.slice(-8)}`}
            className="group cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
            onClick={() => onRowClick(c.id)}
            onMouseEnter={() => onRowPrefetch(c.id)}
            onFocus={() => onRowPrefetch(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick(c.id);
              }
            }}
          >
            <TableCell className="py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.lessee.legalName}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  <span className="font-mono">{c.id.slice(-8)}</span>
                  {" · "}
                  {c.unit.code}
                  {c.unit.name ? ` — ${c.unit.name}` : ""}
                  {" · "}
                  {contractTypeLabel(c.type)}
                  {c.lessee.contactName ? ` · ${c.lessee.contactName}` : ""}
                </p>
              </div>
            </TableCell>
            <TableCell className="py-3">
              <div className="text-center text-xs tabular-nums text-muted-foreground">
                {capitalizeFirst(DATE.format(c.startDate))}
                <span className="mx-1 text-foreground/30">→</span>
                {capitalizeFirst(DATE.format(c.endDate))}
              </div>
            </TableCell>
            <TableCell className="py-3">
              <div className="text-right font-medium tabular-nums">
                {MXN.format(Number(c.monthlyAmount))}
              </div>
            </TableCell>
            <TableCell className="py-3">
              <div className="text-center">
                <Badge variant={contractStatusVariant(c.status)}>
                  {contractStatusLabel(c.status)}
                </Badge>
              </div>
            </TableCell>
            <TableCell className="py-3">
              <ExpiryCell status={c.status} days={c.daysToExpire} />
            </TableCell>
          </TableRow>
        ))}
    </>
  );
}

function ExpiryCell({ status, days }: { status: ContractStatus; days: number }) {
  if (status !== "ACTIVE") {
    return <div className="text-center text-xs text-muted-foreground">—</div>;
  }
  if (days < 0) {
    return (
      <div className="text-center text-xs font-medium text-destructive">
        Vencido
      </div>
    );
  }
  const tone =
    days <= 30
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : days <= 60
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-muted text-muted-foreground ring-foreground/10";
  return (
    <div className="text-center">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1",
          tone,
        )}
      >
        {days}d
      </span>
    </div>
  );
}
