"use client";

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { DependentCounts } from "@/lib/services/audit-undo";

// Singular / plural por tipo de dependiente.
const DEP_LABELS: Record<keyof DependentCounts, [string, string]> = {
  unidades: ["unidad", "unidades"],
  contratos: ["contrato", "contratos"],
  rentas: ["cargo de renta", "cargos de renta"],
  pagos: ["pago", "pagos"],
  fianzas: ["fianza", "fianzas"],
  documentos: ["documento", "documentos"],
  prediales: ["predial", "prediales"],
  mantenimientos: ["mantenimiento", "mantenimientos"],
};

/** ["1 contrato", "12 cargos de renta", "3 pagos"] */
export function formatDependents(dependents: DependentCounts): string[] {
  return (Object.keys(DEP_LABELS) as (keyof DependentCounts)[])
    .map((k) => {
      const n = dependents[k];
      if (!n || n <= 0) return null;
      const [singular, plural] = DEP_LABELS[k];
      return `${n} ${n === 1 ? singular : plural}`;
    })
    .filter((s): s is string => s !== null);
}

/**
 * Bloque de aviso destacado (no destructivo) para los botones Eliminar: avisa
 * que el sujeto tiene registros importantes anidados. El borrado real es lógico
 * (los conserva), así que el texto no dice "se eliminarán".
 */
export function DependentsWarning({
  dependents,
  heading = "Tiene registros importantes asociados:",
}: {
  dependents: DependentCounts;
  heading?: string;
}) {
  const items = formatDependents(dependents);
  if (items.length === 0) return null;
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div>
        <p className="font-medium text-amber-700 dark:text-amber-300">{heading}</p>
        <p className="mt-0.5 text-foreground">{items.join(" · ")}</p>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: ReactNode;
  dependents?: DependentCounts;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}

/**
 * Aviso destacado (destructivo) para acciones que pueden borrar registros
 * importantes anidados. Reutilizable: deshacer una creación en cascada y los
 * botones Eliminar de sujetos con dependientes.
 */
export function DangerConfirmDialog({
  open,
  onOpenChange,
  title = "Se pueden eliminar registros importantes",
  description,
  dependents,
  confirmLabel = "Sí, eliminar todo",
  pending = false,
  onConfirm,
}: Props) {
  const items = dependents ? formatDependents(dependents) : [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <TriangleAlert />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              "Esta acción es permanente y no se puede deshacer."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {items.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm">
            <p className="font-medium text-destructive">Se eliminarán también:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground">
              {items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Eliminando…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
