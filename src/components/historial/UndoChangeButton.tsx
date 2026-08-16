"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DangerConfirmDialog } from "@/components/historial/DangerConfirmDialog";
import { actionGetUndoImpact, actionUndoChange } from "@/server/services/audit-actions";
import {
  auditCategoryLabel,
  categoryOf,
  entityTypeLabel,
  reversibilityOf,
} from "@/shared/audit/categories";
import { describeAuditDetail } from "@/shared/audit/describe";
import { capitalizeFirst } from "@/shared/utils";
import type { AuditLogEntry } from "@/server/services/audit";
import type { UndoImpact } from "@/server/services/audit-undo";
import type { AuditAction } from "@/generated/prisma/enums";

const DATETIME = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface Props {
  entry: AuditLogEntry;
  canUndo: boolean;
}

function copyFor(action: AuditAction): {
  title: string;
  description: string;
  confirm: string;
  success: string;
} {
  switch (action) {
    case "CREATE":
      return {
        title: "¿Deshacer esta creación?",
        description:
          "Se eliminará el registro recién creado. La acción quedará anotada en el historial.",
        confirm: "Sí, deshacer",
        success: "Creación deshecha.",
      };
    case "UPDATE":
      return {
        title: "¿Revertir esta edición?",
        description:
          "Se regresarán los valores anteriores. La acción quedará anotada en el historial.",
        confirm: "Sí, revertir",
        success: "Edición revertida.",
      };
    default:
      return {
        title: "¿Restaurar este registro?",
        description:
          "Se restaurará el registro eliminado. La acción quedará anotada en el historial.",
        confirm: "Sí, restaurar",
        success: "Registro restaurado.",
      };
  }
}

/**
 * Botón "Deshacer". Habilitado solo para cambios reversibles y con permiso.
 * Al usarlo consulta el impacto: si deshacer borrará dependientes, muestra el
 * aviso destacado (destructivo); si no, una confirmación normal.
 */
export function UndoChangeButton({ entry, canUndo }: Props) {
  const rev = reversibilityOf(entry);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<UndoImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canUndo) {
    return (
      <Button size="xs" variant="ghost" disabled title="No tienes permiso para deshacer.">
        <Undo2 />
        Deshacer
      </Button>
    );
  }
  if (!rev.reversible) {
    return (
      <Button size="xs" variant="ghost" disabled title={rev.reason}>
        <Undo2 />
        Deshacer
      </Button>
    );
  }

  async function handleOpen() {
    setLoading(true);
    try {
      const imp = await actionGetUndoImpact(entry.id);
      if (!imp.reversible) {
        // p. ej. ya hay un cambio más reciente (guarda de recencia).
        toast.error(imp.reason ?? "Este cambio ya no se puede deshacer.");
        return;
      }
      setImpact(imp);
      setOpen(true);
    } catch {
      toast.error("No se pudo preparar el deshacer.");
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        await actionUndoChange(entry.id);
        toast.success(copy.success);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo deshacer el cambio.");
      }
    });
  }

  const copy = copyFor(entry.action);
  const detail = describeAuditDetail({
    action: entry.action,
    entityType: entry.entityType,
    changes: entry.changes,
  });
  const area = auditCategoryLabel(categoryOf(entry.entityType));
  const when = capitalizeFirst(DATETIME.format(new Date(entry.createdAt)));
  const who = entry.user?.name ?? entry.user?.email ?? "Sistema";
  const noun = entityTypeLabel(entry.entityType).toLowerCase();

  return (
    <>
      <Button size="xs" variant="ghost" onClick={handleOpen} disabled={loading}>
        <Undo2 />
        Deshacer
      </Button>

      {impact?.danger ? (
        <DangerConfirmDialog
          open={open}
          onOpenChange={setOpen}
          dependents={impact.dependents}
          description={
            <>
              Vas a deshacer la creación de <strong>{noun}</strong>. Se borrará el
              registro y todo lo que cuelga de él. Esta acción es permanente.
            </>
          }
          confirmLabel="Sí, eliminar todo"
          pending={pending}
          onConfirm={handleConfirm}
        />
      ) : (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.title}</AlertDialogTitle>
              <AlertDialogDescription>{copy.description} ¿Deseas continuar?</AlertDialogDescription>
            </AlertDialogHeader>

            {/* Resumen del movimiento que se va a deshacer. */}
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-left text-sm">
              <p className="font-medium text-foreground">{detail}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {area} · {when} · {who}
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
              <Button variant="default" onClick={handleConfirm} disabled={pending}>
                {pending ? "Procesando…" : copy.confirm}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
