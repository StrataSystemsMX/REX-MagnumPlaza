"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useMobileCapture } from "@/components/mobile/MobileCaptureProvider";
import {
  MobileBackLink,
  MobileCard,
  MobileEmpty,
  MobilePageHeader,
  MobilePill,
  MobileScreen,
} from "@/components/mobile/MobileUI";
import type { MaintenanceStatus } from "@/generated/prisma/enums";
import { formatMXN } from "@/shared/format-currency";
import { formatDate } from "@/shared/format-date";
import {
  maintenanceResponsibilityLabel,
  maintenanceStatusLabel,
  maintenanceTypeLabel,
} from "@/shared/i18n/enums";
import { shortPropertyName } from "@/shared/mobile/format";
import type { MaintenanceRow } from "@/server/services/maintenances-queries";
import { actionUpdateMaintenanceStatus } from "@/server/services/maintenances";

const STATUS_PILL: Record<MaintenanceStatus, string> = {
  OVERDUE: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  PLANNED: "bg-secondary text-primary",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-muted text-muted-foreground",
};

// Orden de la lista: lo que requiere atención primero.
const STATUS_ORDER: Record<MaintenanceStatus, number> = {
  OVERDUE: 0,
  IN_PROGRESS: 1,
  PLANNED: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

/** Órdenes de mantenimiento con botón de avance (handoff §8). */
export function MobileMaintenances({ maintenances }: { maintenances: MaintenanceRow[] }) {
  const router = useRouter();
  const { canCreateMaintenance } = useMobileCapture();
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const rows = [...maintenances].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const open = rows.filter((m) => m.status !== "COMPLETED" && m.status !== "CANCELLED").length;

  function advance(m: MaintenanceRow) {
    const next: MaintenanceStatus = m.status === "PLANNED" ? "IN_PROGRESS" : "COMPLETED";
    setAdvancingId(m.id);
    startTransition(async () => {
      try {
        await actionUpdateMaintenanceStatus({ maintenanceId: m.id, status: next });
        toast.success(next === "COMPLETED" ? "Mantenimiento completado." : "Trabajo iniciado.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al actualizar el mantenimiento.");
      } finally {
        setAdvancingId(null);
      }
    });
  }

  return (
    <MobileScreen>
      <MobileBackLink href="/mas" label="Más" />
      <MobilePageHeader size="md" title="Mantenimientos" subtitle={`${open} ${open === 1 ? "abierto" : "abiertos"}`} />

      {rows.map((m) => {
        const canAdvance =
          canCreateMaintenance &&
          (m.status === "PLANNED" || m.status === "IN_PROGRESS" || m.status === "OVERDUE");
        const date = m.completedDate ?? m.scheduledDate;
        return (
          <MobileCard key={m.id} className="flex flex-col gap-2.5 p-3.5">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold">{m.title}</div>
                <div className="text-xs text-muted-foreground">
                  {shortPropertyName(m.property.name)}
                  {m.unit ? ` · ${m.unit.code}` : ""}
                </div>
              </div>
              <MobilePill className={STATUS_PILL[m.status]}>{maintenanceStatusLabel(m.status)}</MobilePill>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{maintenanceTypeLabel(m.type)}</span>
              {date ? <span>{formatDate(date)}</span> : null}
              <span>Paga: {maintenanceResponsibilityLabel(m.responsibility)}</span>
              {m.cost !== null ? (
                <span className="font-medium text-foreground tabular-nums">{formatMXN(m.cost)}</span>
              ) : null}
            </div>
            {canAdvance ? (
              <button
                type="button"
                disabled={advancingId === m.id}
                onClick={() => advance(m)}
                className="flex h-[38px] items-center justify-center rounded-[10px] border border-border bg-background text-sm font-medium text-primary disabled:opacity-60"
              >
                {advancingId === m.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : m.status === "PLANNED" ? (
                  "Iniciar trabajo"
                ) : (
                  "Marcar como completado"
                )}
              </button>
            ) : null}
          </MobileCard>
        );
      })}
      {rows.length === 0 ? (
        <MobileCard>
          <MobileEmpty>Sin mantenimientos registrados</MobileEmpty>
        </MobileCard>
      ) : null}
    </MobileScreen>
  );
}
