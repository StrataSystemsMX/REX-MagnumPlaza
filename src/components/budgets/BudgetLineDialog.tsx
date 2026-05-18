"use client";

import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { Plus, Pencil } from "lucide-react";
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
import { actionUpsertBudgetLine } from "@/lib/services/budgets";
import { upsertBudgetLineSchema, type UpsertBudgetLineInput } from "@/lib/validators/budget";
import { MONTH_KEYS, type BudgetLineRow } from "@/lib/services/budgets-types";
import type { BudgetConceptType } from "@/generated/prisma/enums";

const CONCEPT_LABELS: Record<BudgetConceptType, string> = {
  INCOME_RENT: "Ingreso — Renta",
  INCOME_BILLBOARD: "Ingreso — Espectacular",
  INCOME_GUARANTEE: "Ingreso — Garantía",
  INCOME_OTHER: "Ingreso — Otro",
  EXPENSE: "Egreso operativo",
  TAX_STRATEGY: "Estrategia fiscal",
  DEBT_SERVICE: "Servicio de deuda",
};

const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

interface Props {
  budgetId: string;
  line?: BudgetLineRow;
  trigger?: React.ReactNode;
}

export function BudgetLineDialog({ budgetId, line, trigger }: Props) {
  const [open, setOpen] = useState(false);

  const defaultMonths = Object.fromEntries(
    MONTH_KEYS.map((k) => [k, line?.months[k] ?? 0]),
  ) as UpsertBudgetLineInput["months"];

  const form = useForm<UpsertBudgetLineInput>({
    resolver: zodResolver(upsertBudgetLineSchema) as unknown as Resolver<UpsertBudgetLineInput>,
    defaultValues: {
      budgetId,
      lineId: line?.id,
      conceptType: line?.conceptType ?? "INCOME_RENT",
      conceptLabel: line?.conceptLabel ?? "",
      months: defaultMonths,
    },
  });

  const months = form.watch("months");
  const annual = MONTH_KEYS.reduce((acc, k) => acc + (Number(months[k]) || 0), 0);

  async function onSubmit(values: UpsertBudgetLineInput) {
    try {
      await actionUpsertBudgetLine(values);
      toast.success(line ? "Línea actualizada." : "Línea agregada al presupuesto.");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar la línea.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger as React.ReactElement} />
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus className="size-3.5" />
          Agregar línea
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{line ? "Editar línea" : "Nueva línea de presupuesto"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="conceptType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} items={CONCEPT_LABELS}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.entries(CONCEPT_LABELS) as [BudgetConceptType, string][]).map(
                          ([v, label]) => (
                            <SelectItem key={v} value={v}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="conceptLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Concepto</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Plaza Progreso" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <p className="mb-2 block text-sm font-medium leading-none">Montos mensuales (MXN)</p>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
                {MONTH_KEYS.map((k, i) => (
                  <FormField
                    key={k}
                    control={form.control}
                    name={`months.${k}`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          {MONTH_SHORT[i]}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            className="h-8 px-1 text-right text-xs"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2">
              <span className="text-sm text-muted-foreground">Total anual</span>
              <span className="font-semibold tabular-nums">
                {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(annual)}
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
