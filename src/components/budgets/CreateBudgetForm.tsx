"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionCreateBudgetsBatch } from "@/server/services/budgets";

interface LegalEntityOption {
  id: string;
  code: string;
  legalName: string;
}

interface Props {
  legalEntities: LegalEntityOption[];
  currentYear: number;
  missingOnly?: boolean;
}

export function CreateBudgetForm({ legalEntities, currentYear, missingOnly = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [year, setYear] = useState<number>(currentYear);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(legalEntities.map((e) => e.id)),
  );

  const years = [currentYear, currentYear + 1, currentYear - 1];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) {
      toast.error("Selecciona al menos una razón social.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await actionCreateBudgetsBatch({
          year,
          legalEntityIds: Array.from(selected),
        });
        toast.success(
          `Creado para ${result.created} razón${result.created === 1 ? "" : "es"} social${result.created === 1 ? "" : "es"}.${result.skipped ? ` ${result.skipped} ya existían.` : ""}`,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al crear los presupuestos.");
      }
    });
  }

  return (
    <Card className={missingOnly ? "" : "mx-auto max-w-lg"}>
      <CardContent className="pt-6">
        {!missingOnly && (
          <div className="mb-6 text-center">
            <p className="text-muted-foreground text-sm">
              No hay presupuesto para este año. Crea uno para cada razón social y empieza a registrar líneas.
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium leading-none">Año</p>
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
              items={Object.fromEntries(years.map((y) => [String(y), String(y)]))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium leading-none">Razones sociales</p>
            <div className="space-y-2 rounded-md border p-3">
              {legalEntities.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay razones sociales activas configuradas.
                </p>
              ) : (
                legalEntities.map((e) => (
                  <label key={e.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary"
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                    />
                    <span className="font-medium">{e.code}</span>
                    <span className="text-xs text-muted-foreground">— {e.legalName}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={submit}
            disabled={isPending || selected.size === 0 || legalEntities.length === 0}
          >
            {isPending ? "Creando..." : "Crear presupuesto"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
