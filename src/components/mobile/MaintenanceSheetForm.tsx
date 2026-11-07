"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MobileCard, mobileChipClass } from "@/components/mobile/MobileUI";
import { MobileSheetCta } from "@/components/mobile/MobileSheet";
import type { MaintenanceType } from "@/generated/prisma/enums";
import { maintenanceTypeLabel } from "@/shared/i18n/enums";
import type { MobileCaptureOptions } from "@/server/services/mobile-actions";
import { actionCreateMaintenance } from "@/server/services/maintenances";
import { cn } from "@/shared/utils";
import { createMaintenanceSchema } from "@/shared/validators/maintenance";

const TYPES: MaintenanceType[] = ["CORRECTIVE", "PREVENTIVE", "EMERGENCY"];

export function MaintenanceSheetForm({
  properties,
  onDone,
}: {
  properties: MobileCaptureOptions["properties"];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MaintenanceType>("CORRECTIVE");
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    // Se crea en estado Planeado (actionCreateMaintenance lo fija).
    const parsed = createMaintenanceSchema.safeParse({
      propertyId: propertyId ?? "",
      title,
      type,
      responsibility: "OWNER",
      isRecurring: false,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await actionCreateMaintenance(parsed.data);
        toast.success("Mantenimiento reportado.");
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al crear el reporte.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <MobileCard className="px-3.5 py-3">
        <label htmlFor="mobile-maint-title" className="block text-[13px] text-muted-foreground">
          ¿Qué pasó?
        </label>
        <input
          id="mobile-maint-title"
          value={title}
          maxLength={80}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="Ej. Fuga en baño L3"
          className="mt-1 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
        />
      </MobileCard>

      <div className="flex rounded-[10px] bg-muted p-[3px]">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={cn(
              "flex-1 rounded-[7px] py-2 text-sm font-medium",
              type === t
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(11,14,41,.12)]"
                : "text-muted-foreground",
            )}
          >
            {maintenanceTypeLabel(t)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="px-1 text-[13px] font-medium">Inmueble</span>
        <div className="flex flex-wrap gap-1.5">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={propertyId === p.id}
              onClick={() => {
                setPropertyId(p.id);
                setError(null);
              }}
              className={mobileChipClass(propertyId === p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="px-1 text-[12.5px] text-rose-600">{error}</div> : null}

      <MobileSheetCta onClick={submit} disabled={pending}>
        {pending ? <Loader2 className="mx-auto size-5 animate-spin" /> : "Crear reporte"}
      </MobileSheetCta>
    </div>
  );
}
