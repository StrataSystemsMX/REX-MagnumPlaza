"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  actionRunMorosityCron,
  type ManualCronResult,
} from "@/server/services/admin-cron";

export function RunMorosityCronButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [lastRun, setLastRun] = useState<ManualCronResult | null>(null);

  function run() {
    startTransition(async () => {
      try {
        const r = await actionRunMorosityCron();
        setLastRun(r);
        const transitions =
          r.overdueTransitions > 0
            ? `${r.overdueTransitions} pasaron a OVERDUE.`
            : "Sin transiciones a OVERDUE.";
        toast.success(`Cron OK · ${r.rentsUpdated} rents actualizados · ${transitions}`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al correr el cron.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setOpen(true)} disabled={pending}>
        <Play className="size-4" />
        Correr cron de morosidad ahora
      </Button>

      {lastRun ? (
        <div className="rounded-md border bg-secondary/40 p-3 text-sm">
          <p className="font-medium">Última corrida manual</p>
          <p className="text-xs text-muted-foreground">
            {new Date(lastRun.runAt).toLocaleString("es-MX")} · snapshot{" "}
            {lastRun.snapshotDate}
          </p>
          <p className="mt-1 text-xs">
            {lastRun.rentsUpdated} rents actualizados ·{" "}
            {lastRun.overdueTransitions} a OVERDUE
          </p>
          {Object.keys(lastRun.byNewStatus).length > 0 ? (
            <pre className="mt-1 overflow-auto rounded bg-card p-2 text-[10px] font-mono">
              {JSON.stringify(lastRun.byNewStatus, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Correr el cron de morosidad?</AlertDialogTitle>
            <AlertDialogDescription>
              Recalcula el estado de todos los Rents del tenant según los días
              vencidos y registra un snapshot diario. Las transiciones a
              OVERDUE_* dispararán el hook de notificación (placeholder hasta
              que esté el módulo de WhatsApp).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
              disabled={pending}
            >
              {pending ? "Ejecutando..." : "Ejecutar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
