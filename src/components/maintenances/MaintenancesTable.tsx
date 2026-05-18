"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  MaintenanceResponsibilityBadge,
  MaintenanceStatusBadge,
  MaintenanceTypeBadge,
} from "./MaintenanceBadges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionUpdateMaintenanceStatus } from "@/lib/services/maintenances";
import type { MaintenanceRow } from "@/lib/services/maintenances-queries";
import { MoreHorizontal } from "lucide-react";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

interface Props {
  maintenances: MaintenanceRow[];
  canManage: boolean;
}

export function MaintenancesTable({ maintenances, canManage }: Props) {
  const [isPending, startTransition] = useTransition();

  function updateStatus(maintenanceId: string, status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
    startTransition(async () => {
      try {
        await actionUpdateMaintenanceStatus({
          maintenanceId,
          status,
          ...(status === "COMPLETED" ? { completedDate: new Date() } : {}),
        });
        toast.success(
          status === "COMPLETED"
            ? "Mantenimiento marcado como completado."
            : status === "IN_PROGRESS"
              ? "Mantenimiento en curso."
              : "Mantenimiento cancelado.",
        );
      } catch {
        toast.error("Error al actualizar el estado.");
      }
    });
  }

  if (maintenances.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-muted-foreground">No hay mantenimientos registrados.</p>
          {canManage && (
            <p className="text-sm text-muted-foreground">
              Usa el botón &ldquo;Nuevo mantenimiento&rdquo; para agregar el primero.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Todos los mantenimientos</CardTitle>
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
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {maintenances.map((m) => {
                const isOpen = m.status === "PLANNED" || m.status === "IN_PROGRESS";
                const dateLabel = m.completedDate
                  ? DATE.format(m.completedDate)
                  : m.scheduledDate
                    ? DATE.format(m.scheduledDate)
                    : "—";

                return (
                  <TableRow key={m.id} className={isPending ? "opacity-60" : ""}>
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
                    {canManage && (
                      <TableCell className="text-right">
                        {isOpen && (
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {m.status === "PLANNED" && (
                                <DropdownMenuItem
                                  onClick={() => updateStatus(m.id, "IN_PROGRESS")}
                                >
                                  Marcar en curso
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => updateStatus(m.id, "COMPLETED")}
                              >
                                Marcar completado
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => updateStatus(m.id, "CANCELLED")}
                              >
                                Cancelar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
