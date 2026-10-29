"use client";

import { Archive, ArchiveRestore, Settings2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { expenseTypeLabel } from "@/shared/i18n/enums";
import type { ExpenseType } from "@/generated/prisma/enums";
import { actionSetExpenseCategoryActive } from "@/server/services/expenses";
import type { ManagedExpenseCategory } from "@/server/services/expenses-queries";

interface ManageCategoriesDialogProps {
  categories: ReadonlyArray<ManagedExpenseCategory>;
}

export function ManageCategoriesDialog({ categories }: ManageCategoriesDialogProps) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(category: ManagedExpenseCategory) {
    setPendingId(category.id);
    startTransition(async () => {
      try {
        await actionSetExpenseCategoryActive({
          categoryId: category.id,
          isActive: !category.isActive,
        });
        toast.success(
          category.isActive
            ? `"${category.name}" archivado.`
            : `"${category.name}" restaurado.`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "No se pudo actualizar el concepto.";
        toast.error(message);
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="w-full sm:w-auto" />}>
        <Settings2 className="size-4" />
        Conceptos
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conceptos de egreso</DialogTitle>
          <DialogDescription>
            Archiva los conceptos que ya no uses para ocultarlos de la captura. El
            historial de egresos no se pierde.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay conceptos de egreso.
            </p>
          ) : (
            categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md border p-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        c.isActive ? "font-medium" : "font-medium text-muted-foreground"
                      }
                    >
                      {c.name}
                    </span>
                    {!c.isActive ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Archivado
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {expenseTypeLabel(c.type as ExpenseType)} · {c._count.expenses}{" "}
                    egreso(s)
                  </p>
                </div>
                <Button
                  variant={c.isActive ? "ghost" : "secondary"}
                  size="sm"
                  disabled={pendingId === c.id}
                  onClick={() => toggle(c)}
                >
                  {c.isActive ? (
                    <>
                      <Archive className="size-4" />
                      Archivar
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="size-4" />
                      Restaurar
                    </>
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
