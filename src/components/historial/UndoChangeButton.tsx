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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { actionUndoChange } from "@/lib/services/audit-actions";
import { reversibilityOf, type AuditEntryLike } from "@/lib/audit/categories";

interface Props {
  entry: AuditEntryLike & { id: string };
  canUndo: boolean;
}

/**
 * Botón "Deshacer". Sólo se habilita para cambios reversibles (restaurar un
 * borrado lógico) y para usuarios con permiso. Confirma antes de ejecutar.
 */
export function UndoChangeButton({ entry, canUndo }: Props) {
  const rev = reversibilityOf(entry);
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  function handleConfirm() {
    startTransition(async () => {
      try {
        await actionUndoChange(entry.id);
        toast.success("Cambio deshecho. Registro restaurado.");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo deshacer el cambio.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button size="xs" variant="ghost">
            <Undo2 />
            Deshacer
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Deshacer este cambio?</AlertDialogTitle>
          <AlertDialogDescription>
            Se restaurará el registro eliminado. La restauración quedará anotada en
            el historial.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="default" onClick={handleConfirm} disabled={pending}>
            {pending ? "Deshaciendo…" : "Sí, deshacer"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
