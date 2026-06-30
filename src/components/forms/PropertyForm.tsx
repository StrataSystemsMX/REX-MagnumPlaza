"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
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
import { CharacterCount } from "@/components/ui/character-count";

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

const PROPERTY_STATUSES: ReadonlyArray<PropertyStatus> = [
  "DISPONIBLE",
  "EN_RENTA",
  "BLOQUEADO",
];

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
  insuranceProvider?: string | null;
  insurancePolicyNumber?: string | null;
  insuranceExpiresAt?: Date | string | null;
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
    // El cast evita el mismatch input/output que introduce el z.preprocess de
    // insuranceExpiresAt (mismo patrón que EditMaintenanceDialog).
    resolver: zodResolver(createPropertySchema) as unknown as Resolver<CreatePropertyInput>,
    defaultValues: {
      name: initial?.name ?? "",
      type: initialType,
      status: initial?.status ?? "DISPONIBLE",
      address: initial?.address ?? "",
      ownerEntityId: initial?.ownerEntityId ?? "",
      managerEntityId: initial?.managerEntityId ?? "",
      cadastralKey: initial?.cadastralKey ?? "",
      latitude: initial?.latitude ?? undefined,
      longitude: initial?.longitude ?? undefined,
      totalArea: initial?.totalArea ?? undefined,
      notes: initial?.notes ?? "",
      insuranceProvider: initial?.insuranceProvider ?? "",
      insurancePolicyNumber: initial?.insurancePolicyNumber ?? "",
      insuranceExpiresAt: initial?.insuranceExpiresAt
        ? new Date(initial.insuranceExpiresAt)
        : undefined,
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
                  <Input {...field} maxLength={50} />
                </FormControl>
                <CharacterCount current={field.value?.length ?? 0} max={50} />
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
                  <Input {...field} value={field.value ?? ""} maxLength={30} />
                </FormControl>
                <CharacterCount current={(field.value ?? "").length} max={30} />
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
                  <Input {...field} maxLength={120} />
                </FormControl>
                <CharacterCount current={field.value?.length ?? 0} max={120} />
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
          <details className="group md:col-span-2">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5 hover:bg-muted/50">
              <div>
                <h3 className="text-sm font-semibold">Ubicación y superficie</h3>
                <p className="text-xs text-muted-foreground">
                  Latitud, longitud y área total. Se usa para el mapa en la página pública del promotor.
                </p>
              </div>
              <span
                aria-hidden
                className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground transition-transform group-open:rotate-180"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </summary>
            <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitud</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="29.107456"
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
                        step="any"
                        placeholder="-110.949821"
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
              <p className="text-xs text-muted-foreground md:col-span-2">
                Para obtener las coordenadas: abre la dirección en Google Maps, click
                derecho sobre el pin y copia la primera línea del menú (lat, lng).
              </p>
              <FormField
                control={form.control}
                name="totalArea"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Superficie total (m²)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
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
            </div>
          </details>

          <details className="group md:col-span-2">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5 hover:bg-muted/50">
              <div>
                <h3 className="text-sm font-semibold">Seguro del inmueble</h3>
                <p className="text-xs text-muted-foreground">
                  Aseguradora, póliza y vencimiento. El sistema avisa cuando el seguro
                  está por vencer.
                </p>
              </div>
              <span
                aria-hidden
                className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground transition-transform group-open:rotate-180"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </summary>
            <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="insuranceProvider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aseguradora</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} maxLength={80} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="insurancePolicyNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de póliza</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} maxLength={50} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="insuranceExpiresAt"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Vence el seguro</FormLabel>
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
            </div>
          </details>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Notas</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} value={field.value ?? ""} maxLength={1000} />
                </FormControl>
                <CharacterCount current={(field.value ?? "").length} max={1000} />
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
