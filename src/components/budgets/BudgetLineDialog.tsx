"use client";

import React, { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { Plus } from "lucide-react";
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
import { formatMXN } from "@/lib/format-currency";
import { upsertBudgetLineSchema, type UpsertBudgetLineInput } from "@/lib/validators/budget";
import { MONTH_KEYS, type BudgetLineRow } from "@/lib/services/budgets-types";
import type { BudgetConceptType } from "@/generated/prisma/enums";

const CONCEPT_LABELS: Record<BudgetConceptType, string> = {
  INCOME_RENT: "Ingreso — Renta",
  INCOME_BILLBOARD: "Ingreso — Espectacular",
  INCOME_GUARANTEE: "Ingreso — Fianza",
  INCOME_OTHER: "Ingreso — Otro",
  EXPENSE: "Egreso operativo",
  TAX_STRATEGY: "Estrategia fiscal",
  DEBT_SERVICE: "Servicio de deuda",
};

const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function isIncome(t: BudgetConceptType): boolean {
  return t === "INCOME_RENT" || t === "INCOME_BILLBOARD" || t === "INCOME_GUARANTEE" || t === "INCOME_OTHER";
}

interface PropertyOption {
  id: string;
  name: string;
}

interface BudgetOption {
  budgetId: string;
  legalEntityId: string;
  code: string;
}

interface Props {
  budgetId?: string;
  budgetOptions?: BudgetOption[];
  line?: BudgetLineRow;
  properties?: PropertyOption[];
  defaultConceptType?: BudgetConceptType;
  trigger?: React.ReactNode;
  triggerLabel?: string;
}

export function BudgetLineDialog({
  budgetId,
  budgetOptions,
  line,
  properties = [],
  defaultConceptType,
  trigger,
  triggerLabel = "Agregar línea",
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(
    budgetId ?? line?.budgetId ?? budgetOptions?.[0]?.budgetId ?? "",
  );

  useEffect(() => {
    if (open) {
      setSelectedBudgetId(budgetId ?? line?.budgetId ?? budgetOptions?.[0]?.budgetId ?? "");
    }
  }, [open, budgetId, line, budgetOptions]);

  const defaultMonths = Object.fromEntries(
    MONTH_KEYS.map((k) => [k, line?.months[k] ?? 0]),
  ) as UpsertBudgetLineInput["months"];

  const form = useForm<UpsertBudgetLineInput>({
    resolver: zodResolver(upsertBudgetLineSchema) as unknown as Resolver<UpsertBudgetLineInput>,
    defaultValues: {
      budgetId: selectedBudgetId,
      lineId: line?.id,
      conceptType: line?.conceptType ?? defaultConceptType ?? "INCOME_RENT",
      conceptLabel: line?.conceptLabel ?? "",
      propertyId: line?.propertyId ?? null,
      months: defaultMonths,
    },
  });

  // mantener budgetId del form en sync con selección
  useEffect(() => {
    form.setValue("budgetId", selectedBudgetId);
  }, [selectedBudgetId, form]);

  const conceptType = form.watch("conceptType");
  const months = form.watch("months");
  const annual = MONTH_KEYS.reduce((acc, k) => acc + (Number(months[k]) || 0), 0);

  // Si el tipo deja de ser INCOME, limpiar propertyId
  useEffect(() => {
    if (!isIncome(conceptType)) {
      form.setValue("propertyId", null);
    }
  }, [conceptType, form]);

  async function onSubmit(values: UpsertBudgetLineInput) {
    try {
      await actionUpsertBudgetLine(values);
      toast.success(line ? "Línea actualizada." : "Línea agregada al presupuesto.");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar la línea.");
    }
  }

  const showBudgetSelector = !line && !budgetId && (budgetOptions?.length ?? 0) > 1;
  const showPropertyField = isIncome(conceptType) && properties.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger as React.ReactElement} />
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus className="size-3.5" />
          {triggerLabel}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{line ? "Editar línea" : "Nueva línea de presupuesto"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {showBudgetSelector && (
              <div>
                <p className="mb-1.5 text-sm font-medium leading-none">Razón social</p>
                <Select
                  value={selectedBudgetId}
                  onValueChange={(v) => setSelectedBudgetId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona razón social" />
                  </SelectTrigger>
                  <SelectContent>
                    {budgetOptions!.map((b) => (
                      <SelectItem key={b.budgetId} value={b.budgetId}>
                        {b.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

            {showPropertyField && (
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inmueble (opcional)</FormLabel>
                    <Select
                      value={field.value ?? "__none__"}
                      onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin inmueble" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Sin inmueble</SelectItem>
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
            )}

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
                {formatMXN(annual)}
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting || !selectedBudgetId}>
                {form.formState.isSubmitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
