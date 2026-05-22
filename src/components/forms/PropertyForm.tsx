"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMemo, useTransition } from "react";
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
import { propertyStatusLabel, propertyTypeLabel } from "@/lib/i18n/enums";
import {
  createPropertySchema,
  type CreatePropertyInput,
} from "@/lib/validators/property";
import {
  actionCreateProperty,
  actionUpdateProperty,
} from "@/lib/services/properties";
import type { LegalEntityOption } from "@/lib/services/properties-queries";
import type { PropertyStatus, PropertyType } from "@/generated/prisma/enums";

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

const PROPERTY_STATUSES: ReadonlyArray<PropertyStatus> = ["ACTIVO", "BLOQUEADO"];

export interface PropertyFormInitial {
  id?: string;
  name: string;
  type: PropertyType;
  status?: PropertyStatus;
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
  /** Fija el tipo y deshabilita el select. Tiene precedencia sobre `excludedTypes` y `initial.type`. */
  lockedType?: PropertyType;
  /** Tipos a ocultar del select. Útil para `/inmuebles` que excluye PLAZA_COMERCIAL. */
  excludedTypes?: ReadonlyArray<PropertyType>;
  /** Acción extra (p.ej. Eliminar) renderizada a la izquierda del botón submit. */
  secondaryAction?: React.ReactNode;
}

export function PropertyForm({
  legalEntities,
  initial,
  onSuccess,
  submitLabel = "Guardar",
  lockedType,
  excludedTypes,
  secondaryAction,
}: PropertyFormProps) {
  const isEdit = Boolean(initial?.id);
  const [pending, startTransition] = useTransition();

  const availableTypes = lockedType
    ? [lockedType]
    : excludedTypes && excludedTypes.length > 0
      ? PROPERTY_TYPES.filter((t) => !excludedTypes.includes(t))
      : PROPERTY_TYPES;

  const initialType: PropertyType =
    lockedType ?? initial?.type ?? availableTypes[0] ?? "PLAZA_COMERCIAL";

  const typeItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(availableTypes.map((t) => [t, propertyTypeLabel(t)])),
    [availableTypes],
  );

  const statusItems = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(PROPERTY_STATUSES.map((s) => [s, propertyStatusLabel(s)])),
    [],
  );

  const legalEntityItems = useMemo<Record<string, string>>(
    () => Object.fromEntries(legalEntities.map((e) => [e.id, `${e.code} — ${e.legalName}`])),
    [legalEntities],
  );

  const form = useForm<CreatePropertyInput>({
    resolver: zodResolver(createPropertySchema),
    defaultValues: {
      name: initial?.name ?? "",
      type: initialType,
      status: initial?.status ?? "ACTIVO",
      address: initial?.address ?? "",
      ownerEntityId: initial?.ownerEntityId ?? "",
      managerEntityId: initial?.managerEntityId ?? "",
      cadastralKey: initial?.cadastralKey ?? "",
      notes: initial?.notes ?? "",
    },
  });

  function onSubmit(values: CreatePropertyInput) {
    startTransition(async () => {
      try {
        const isPlaza = values.type === "PLAZA_COMERCIAL";
        if (isEdit && initial?.id) {
          await actionUpdateProperty(initial.id, values);
          toast.success(isPlaza ? "Plaza actualizada." : "Inmueble actualizado.");
        } else {
          await actionCreateProperty(values);
          toast.success(isPlaza ? "Plaza creada." : "Inmueble creado.");
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
                  <Input {...field} />
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
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={Boolean(lockedType)}
                  items={typeItems}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {availableTypes.map((t) => (
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
                  <Input {...field} value={field.value ?? ""} />
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
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ownerEntityId"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Razón social dueña</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  items={legalEntityItems}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
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
              <FormItem className="md:col-span-2">
                <FormLabel>Razón social administradora</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  items={legalEntityItems}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
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
            name="status"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Estado</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  items={statusItems}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona el estado" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PROPERTY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {propertyStatusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Bloqueado oculta renta, badge de disponible e inquilino en la lista de
                  inmuebles. Úsalo para propiedades que no se rentan (p. ej. casa del
                  dueño).
                </p>
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
                  <Textarea rows={3} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <div>{secondaryAction}</div>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
