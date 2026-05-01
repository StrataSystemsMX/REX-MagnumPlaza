"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { propertyTypeLabel } from "@/lib/i18n/enums";
import {
  createPropertySchema,
  type CreatePropertyInput,
} from "@/lib/validators/property";
import {
  actionCreateProperty,
  actionUpdateProperty,
} from "@/lib/services/properties";
import type { LegalEntityOption } from "@/lib/services/properties-queries";
import type { PropertyType } from "@/generated/prisma/enums";

const PROPERTY_TYPES: ReadonlyArray<PropertyType> = [
  "PLAZA_COMERCIAL",
  "TERRENO_RENTADO",
  "EDIFICIO",
  "OFICINA",
  "CASA",
  "BODEGA",
  "ESPECTACULAR",
  "OTRO",
];

export interface PropertyFormInitial {
  id?: string;
  name: string;
  type: PropertyType;
  address: string;
  ownerEntityId: string;
  managerEntityId: string;
  cadastralKey?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  totalArea?: number | null;
  notes?: string | null;
}

interface PropertyFormProps {
  legalEntities: ReadonlyArray<LegalEntityOption>;
  initial?: PropertyFormInitial;
  /** Llamado tras un guardado exitoso (cerrar dialog, etc.). */
  onSuccess?: () => void;
  /** Texto del botón submit; default "Guardar". */
  submitLabel?: string;
}

export function PropertyForm({
  legalEntities,
  initial,
  onSuccess,
  submitLabel = "Guardar",
}: PropertyFormProps) {
  const isEdit = Boolean(initial?.id);
  const [pending, startTransition] = useTransition();

  const form = useForm<CreatePropertyInput>({
    resolver: zodResolver(createPropertySchema),
    defaultValues: {
      name: initial?.name ?? "",
      type: initial?.type ?? "PLAZA_COMERCIAL",
      address: initial?.address ?? "",
      ownerEntityId: initial?.ownerEntityId ?? "",
      managerEntityId: initial?.managerEntityId ?? "",
      cadastralKey: initial?.cadastralKey ?? "",
      latitude: initial?.latitude ?? undefined,
      longitude: initial?.longitude ?? undefined,
      totalArea: initial?.totalArea ?? undefined,
      notes: initial?.notes ?? "",
    },
  });

  function onSubmit(values: CreatePropertyInput) {
    startTransition(async () => {
      try {
        if (isEdit && initial?.id) {
          await actionUpdateProperty(initial.id, values);
          toast.success("Inmueble actualizado.");
        } else {
          await actionCreateProperty(values);
          toast.success("Inmueble creado.");
        }
        onSuccess?.();
        form.reset(values);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error al guardar.";
        toast.error(message);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input placeholder="Plaza Magnum Progreso" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PROPERTY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {propertyTypeLabel(t)}
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
            name="cadastralKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Clave catastral</FormLabel>
                <FormControl>
                  <Input
                    placeholder="15924002"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Dirección</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Blvd Progreso M-1A, Hermosillo, Sonora"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ownerEntityId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Razón social dueña</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una razón social" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {legalEntities.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.code} — {e.legalName}
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
            name="managerEntityId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Razón social administradora</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una razón social" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {legalEntities.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.code} — {e.legalName}
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
            name="totalArea"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Área total (m²)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="350"
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? undefined : Number(e.target.value),
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="latitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Latitud</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.000001"
                    placeholder="29.0729"
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? undefined : Number(e.target.value),
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="longitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Longitud</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.000001"
                    placeholder="-110.9559"
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? undefined : Number(e.target.value),
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Notas</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Información adicional, contexto fiscal, particularidades..."
                    rows={3}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
