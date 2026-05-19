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
import { EnumSelect } from "@/components/ui/enum-select";
import { Textarea } from "@/components/ui/textarea";
import { unitStatusLabel } from "@/lib/i18n/enums";
import {
  createUnitSchema,
  type CreateUnitInput,
} from "@/lib/validators/unit";
import { actionCreateUnit, actionUpdateUnit } from "@/lib/services/units";
import type { UnitStatus } from "@/generated/prisma/enums";

const UNIT_STATUSES: ReadonlyArray<UnitStatus> = [
  "DISPONIBLE",
  "APARTADA",
  "RENTADA",
  "EN_REMODELACION",
  "NO_DISPONIBLE",
];

export interface UnitFormInitial {
  id?: string;
  propertyId: string;
  code: string;
  name?: string | null;
  area?: number | null;
  estimatedRent?: number | null;
  status: UnitStatus;
  notes?: string | null;
}

interface UnitFormProps {
  initial: UnitFormInitial;
  onSuccess?: () => void;
  submitLabel?: string;
  secondaryAction?: React.ReactNode;
}

export function UnitForm({ initial, onSuccess, submitLabel = "Guardar", secondaryAction }: UnitFormProps) {
  const isEdit = Boolean(initial.id);
  const [pending, startTransition] = useTransition();

  const form = useForm<CreateUnitInput>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: {
      propertyId: initial.propertyId,
      code: initial.code ?? "",
      name: initial.name ?? "",
      area: initial.area ?? undefined,
      estimatedRent: initial.estimatedRent ?? undefined,
      status: initial.status,
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
