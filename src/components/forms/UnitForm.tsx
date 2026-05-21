"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
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
import { EnumSelect } from "@/components/ui/enum-select";
import { Textarea } from "@/components/ui/textarea";
import { includedServiceLabel, unitStatusLabel } from "@/lib/i18n/enums";
import {
  createUnitSchema,
  type CreateUnitInput,
} from "@/lib/validators/unit";
import { actionCreateUnit, actionUpdateUnit } from "@/lib/services/units";
import type { IncludedService, UnitStatus } from "@/generated/prisma/enums";

const UNIT_STATUSES: ReadonlyArray<UnitStatus> = [
  "DISPONIBLE",
  "APARTADA",
  "RENTADA",
  "EN_REMODELACION",
  "NO_DISPONIBLE",
];

const INCLUDED_SERVICES: ReadonlyArray<IncludedService> = [
  "AGUA",
  "LUZ",
  "GAS",
  "INTERNET",
  "MANTENIMIENTO",
  "VIGILANCIA",
  "ESTACIONAMIENTO",
];

export interface UnitFormInitial {
  id?: string;
  propertyId: string;
  code: string;
  name?: string | null;
  area?: number | null;
  estimatedRent?: number | null;
  status: UnitStatus;
  depositMonths?: number | null;
  minContractMonths?: number | null;
  maintenanceFee?: number | null;
  availableFrom?: Date | string | null;
  includedServices?: IncludedService[] | null;
  notes?: string | null;
}

interface UnitFormProps {
  initial: UnitFormInitial;
  onSuccess?: () => void;
  submitLabel?: string;
  secondaryAction?: React.ReactNode;
}

function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function UnitForm({ initial, onSuccess, submitLabel = "Guardar", secondaryAction }: UnitFormProps) {
  const isEdit = Boolean(initial.id);
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateUnitInput>({
    resolver: zodResolver(createUnitSchema) as unknown as Resolver<CreateUnitInput>,
    defaultValues: {
      propertyId: initial.propertyId,
      code: initial.code ?? "",
      name: initial.name ?? "",
      area: initial.area ?? undefined,
      estimatedRent: initial.estimatedRent ?? undefined,
      status: initial.status,
      depositMonths: initial.depositMonths ?? undefined,
      minContractMonths: initial.minContractMonths ?? undefined,
      maintenanceFee: initial.maintenanceFee ?? undefined,
      availableFrom: initial.availableFrom
        ? initial.availableFrom instanceof Date
          ? initial.availableFrom
          : new Date(initial.availableFrom)
        : undefined,
      includedServices: initial.includedServices ?? [],
      notes: initial.notes ?? "",
    },
  });

  function onSubmit(values: CreateUnitInput) {
    startTransition(async () => {
      try {
        if (isEdit && initial.id) {
          await actionUpdateUnit(initial.id, values);
          toast.success("Unidad actualizada.");
        } else {
          await actionCreateUnit(values);
          toast.success("Unidad creada.");
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Identificador</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre / Inquilino actual</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="estimatedRent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Renta estimada (MXN)</FormLabel>
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
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Estado</FormLabel>
                <EnumSelect
                  values={UNIT_STATUSES}
                  labelFor={unitStatusLabel}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Selecciona estado"
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4 border-t pt-6">
          <div>
            <h3 className="text-sm font-semibold">Condiciones comerciales</h3>
            <p className="text-xs text-muted-foreground">
              Información que verá el prospecto en el link público del promotor.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="depositMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Depósito en garantía (meses)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="36"
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
              name="minContractMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plazo mínimo de contrato (meses)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="120"
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
              name="maintenanceFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuota de mantenimiento (MXN)</FormLabel>
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
            <FormField
              control={form.control}
              name="availableFrom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Disponible desde</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={toDateInputValue(field.value as Date | string | null | undefined)}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "" ? undefined : new Date(e.target.value),
                        )
                      }
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Déjalo vacío si está disponible inmediatamente.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="includedServices"
            render={({ field }) => {
              const selected = (field.value ?? []) as IncludedService[];
              return (
                <FormItem>
                  <FormLabel>Servicios incluidos en la renta</FormLabel>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                    {INCLUDED_SERVICES.map((s) => {
                      const checked = selected.includes(s);
                      return (
                        <label
                          key={s}
                          className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm leading-tight transition ${
                            checked
                              ? "border-foreground/30 bg-accent"
                              : "border-input hover:bg-accent/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 shrink-0 accent-foreground"
                            checked={checked}
                            onChange={(e) => {
                              field.onChange(
                                e.target.checked
                                  ? [...selected, s]
                                  : selected.filter((v) => v !== s),
                              );
                            }}
                          />
                          <span className="min-w-0">{includedServiceLabel(s)}</span>
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas internas</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
