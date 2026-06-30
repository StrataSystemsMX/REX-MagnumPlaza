"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MaintenanceAttachments } from "@/components/maintenances/MaintenanceAttachments";
import { actionUpdateMaintenance } from "@/lib/services/maintenances";
import { CharacterCount } from "@/components/ui/character-count";
import {
  updateMaintenanceSchema,
  type UpdateMaintenanceInput,
} from "@/lib/validators/maintenance";
import type {
  MaintenanceRow,
  PropertyForMaintenance,
} from "@/lib/services/maintenances-queries";
import { isPlaza } from "@/lib/i18n/unit-label";

const TYPE_LABELS = {
  PERIODIC: "Periódico",
  CORRECTIVE: "Correctivo",
  PREVENTIVE: "Preventivo",
  EMERGENCY: "Emergencia",
  REMODELING: "Remodelación",
} as const;

const RESP_LABELS = {
  OWNER: "Propietario",
  LESSEE: "Inquilino",
  SHARED: "Compartido",
} as const;

const STATUS_LABELS = {
  PLANNED: "Planeado",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
  OVERDUE: "Vencido",
} as const;

interface Props {
  maintenance: MaintenanceRow | null;
  properties: PropertyForMaintenance[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function EditMaintenanceDialog({
  maintenance,
  properties,
  open,
  onOpenChange,
}: Props) {
  const form = useForm<UpdateMaintenanceInput>({
    resolver: zodResolver(updateMaintenanceSchema) as unknown as Resolver<UpdateMaintenanceInput>,
    defaultValues: {
      maintenanceId: "",
      propertyId: "",
      unitId: null,
      title: "",
      description: "",
      type: "CORRECTIVE",
      responsibility: "OWNER",
      status: "PLANNED",
      vendor: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!maintenance) return;
    form.reset({
      maintenanceId: maintenance.id,
      propertyId: maintenance.property.id,
      unitId: maintenance.unit?.id ?? null,
      title: maintenance.title,
      description: maintenance.description ?? "",
      type: maintenance.type,
      responsibility: maintenance.responsibility,
      status: maintenance.status,
      scheduledDate: maintenance.scheduledDate ?? undefined,
      vendor: maintenance.vendor ?? "",
      cost: maintenance.cost ?? undefined,
      notes: maintenance.notes ?? "",
    });
  }, [maintenance, form]);

  const selectedPropertyId = form.watch("propertyId");
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);

  const propertyLabels = Object.fromEntries(properties.map((p) => [p.id, p.name]));
  const unitLabels = selectedProperty
    ? Object.fromEntries(
        selectedProperty.units.map((u) => [u.id, `${u.code}${u.name ? ` — ${u.name}` : ""}`]),
      )
    : {};

  async function onSubmit(values: UpdateMaintenanceInput) {
    try {
      await actionUpdateMaintenance(values);
      toast.success("Mantenimiento actualizado.");
      onOpenChange(false);
    } catch {
      toast.error("Error al actualizar el mantenimiento.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar mantenimiento</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción del trabajo</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={80} />
                  </FormControl>
                  <CharacterCount current={field.value?.length ?? 0} max={80} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} items={TYPE_LABELS}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="responsibility"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsable</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} items={RESP_LABELS}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(RESP_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Propiedad</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue("unitId", null);
                      }}
                      value={field.value}
                      items={propertyLabels}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona una propiedad" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {properties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} items={STATUS_LABELS}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* El "local específico" solo aplica a plazas con varios locales.
                Un inmueble individual se mantiene a nivel propiedad completa. */}
            {selectedProperty &&
              isPlaza(selectedProperty.type) &&
              selectedProperty.units.length > 0 && (
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Local específico (opcional)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                      items={unitLabels}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Toda la propiedad" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectedProperty.units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.code}{u.name ? ` — ${u.name}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha programada</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={
                          field.value instanceof Date
                            ? toDateInput(field.value)
                            : (field.value as string | undefined) ?? ""
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo estimado (MXN)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? undefined : e.target.valueAsNumber,
                          )
                        }
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="vendor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proveedor / Contratista (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del proveedor" {...field} value={field.value ?? ""} maxLength={100} />
                  </FormControl>
                  <CharacterCount current={(field.value ?? "").length} max={100} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas adicionales</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Detalles, observaciones..."
                      {...field}
                      value={field.value ?? ""}
                      maxLength={300}
                    />
                  </FormControl>
                  <CharacterCount current={(field.value ?? "").length} max={300} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Form>

        {maintenance ? (
          <MaintenanceAttachments
            maintenanceId={maintenance.id}
            documents={maintenance.documents}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
