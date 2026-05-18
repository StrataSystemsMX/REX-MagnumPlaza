"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionCreateBudget } from "@/lib/services/budgets";
import { createBudgetSchema, type CreateBudgetInput } from "@/lib/validators/budget";

interface LegalEntityOption {
  id: string;
  code: string;
  legalName: string;
}

interface Props {
  legalEntities: LegalEntityOption[];
  currentYear: number;
}

export function CreateBudgetForm({ legalEntities, currentYear }: Props) {
  const years = [currentYear, currentYear + 1, currentYear - 1];

  const form = useForm<CreateBudgetInput>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: { legalEntityId: legalEntities[0]?.id ?? "", year: currentYear },
  });

  async function onSubmit(values: CreateBudgetInput) {
    try {
      await actionCreateBudget(values);
      toast.success("Presupuesto creado. Ahora agrega las líneas.");
    } catch {
      toast.error("Error al crear el presupuesto.");
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="pt-6">
        <div className="mb-6 text-center">
          <p className="text-muted-foreground text-sm">
            No hay presupuesto para este año. Crea uno para empezar a registrar las metas por concepto.
          </p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="legalEntityId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razón social</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona" />
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
              name="year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Año</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    value={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creando..." : "Crear presupuesto"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
