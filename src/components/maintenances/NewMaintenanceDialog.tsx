"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { actionCreateMaintenance } from "@/lib/services/maintenances";
import { CharacterCount } from "@/components/ui/character-count";
import { createMaintenanceSchema, type CreateMaintenanceInput } from "@/lib/validators/maintenance";
import type { PropertyForMaintenance } from "@/lib/services/maintenances-queries";
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

interface Props {
  properties: PropertyForMaintenance[];
}

export function NewMaintenanceDialog({ properties }: Props) {
  const [open, setOpen] = useState(false);

  const form = useForm<CreateMaintenanceInput>({
    resolver: zodResolver(createMaintenanceSchema) as unknown as Resolver<CreateMaintenanceInput>,
    defaultValues: {
      propertyId: "",
      unitId: null,
      title: "",
      type: "CORRECTIVE",
      responsibility: "OWNER",
      isRecurring: false,
    },
  });

  const selectedPropertyId = form.watch("propertyId");
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);

  const propertyLabels = Object.fromEntries(properties.map((p) => [p.id, p.name]));
  const unitLabels = selectedProperty
    ? Object.fromEntries(
        selectedProperty.units.map((u) => [u.id, `${u.code}${u.name ? ` — ${u.name}` : ""}`]),
      )
    : {};

  async function onSubmit(values: CreateMaintenanceInput) {
    try {
      await actionCreateMaintenance(values);
      toast.success("Mantenimiento registrado.");
      setOpen(false);
      form.reset();
    } catch {
      toast.error("Error al registrar el mantenimiento.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        Registrar mantenimiento
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar mantenimiento</DialogTitle>
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
                    <Input placeholder="Ej. Reparación de techo — local L3" {...field} maxLength={80} />
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
                      <SelectTrigger>
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
                            ? field.value.toISOString().slice(0, 10)
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
                    <Textarea rows={2} placeholder="Detalles, observaciones..." {...field} value={field.value ?? ""} maxLength={300} />
                  </FormControl>
                  <CharacterCount current={(field.value ?? "").length} max={300} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Guardando..." : "Registrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
