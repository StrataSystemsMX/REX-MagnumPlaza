"use client";

import { useMemo, useState } from "react";
import {
  MaintenanceResponsibilityBadge,
  MaintenanceStatusBadge,
  MaintenanceTypeBadge,
} from "./MaintenanceBadges";
import { EditMaintenanceDialog } from "./EditMaintenanceDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  MaintenanceRow,
  PropertyForMaintenance,
} from "@/lib/services/maintenances-queries";

const TABS = [
  { key: "manual", label: "Manuales" },
  { key: "deposit", label: "De fianzas" },
] as const;

type SourceTab = (typeof TABS)[number]["key"];

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

interface Props {
  maintenances: MaintenanceRow[];
  properties: PropertyForMaintenance[];
  canManage: boolean;
}

export function MaintenancesTable({ maintenances, properties, canManage }: Props) {
  const [editing, setEditing] = useState<MaintenanceRow | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SourceTab>("manual");

  const counts = useMemo(
    () => ({
      manual: maintenances.filter((m) => m.source === "manual").length,
      deposit: maintenances.filter((m) => m.source === "deposit").length,
    }),
    [maintenances],
  );

  const filtered = useMemo(
    () => maintenances.filter((m) => m.source === activeTab),
    [maintenances, activeTab],
  );

  function handleRowClick(m: MaintenanceRow) {
    if (!canManage) return;
    setEditing(m);
    setOpen(true);
  }

  const tabs = (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "pb-3 text-sm font-medium transition-colors border-b-2",
              activeTab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
              ({counts[t.key]})
            </span>
          </button>
        ))}
      </nav>
    </div>
  );

  const emptyMessage =
    activeTab === "deposit"
      ? "No hay mantenimientos generados desde fianzas."
      : "No hay mantenimientos registrados.";

  if (filtered.length === 0) {
    return (
      <>
        {tabs}
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-muted-foreground">{emptyMessage}</p>
            {canManage && activeTab === "manual" && (
              <p className="text-sm text-muted-foreground">
                Usa el botón &ldquo;Nuevo mantenimiento&rdquo; para agregar el primero.
              </p>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      {tabs}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            {activeTab === "deposit" ? "Mantenimientos desde fianzas" : "Mantenimientos manuales"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trabajo</TableHead>
                  <TableHead>Propiedad / Local</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead>Proveedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => {
                  const dateLabel = m.completedDate
                    ? DATE.format(m.completedDate)
                    : m.scheduledDate
                      ? DATE.format(m.scheduledDate)
                      : "—";

                  return (
                    <TableRow
                      key={m.id}
                      onClick={() => handleRowClick(m)}
                      className={canManage ? "cursor-pointer" : undefined}
                    >
                      <TableCell>
                        <div className="max-w-[240px]">
                          <p className="font-medium leading-snug">{m.title}</p>
                          {m.description && (
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {m.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">{m.property.name}</span>
                        {m.unit && (
                          <span className="ml-1 font-medium text-foreground">{m.unit.code}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <MaintenanceTypeBadge type={m.type} />
                      </TableCell>
                      <TableCell>
                        <MaintenanceResponsibilityBadge responsibility={m.responsibility} />
                      </TableCell>
                      <TableCell>
                        <MaintenanceStatusBadge status={m.status} />
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
                        {dateLabel}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {m.cost !== null ? (
                          <span className="font-medium">{MXN.format(m.cost)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.vendor ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <EditMaintenanceDialog
          maintenance={editing}
          properties={properties}
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setEditing(null);
          }}
        />
      )}
    </>
  );
}
