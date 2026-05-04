"use client";

import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  actionActivateContract,
  actionRenewContract,
  actionTerminateContract,
} from "@/lib/services/contracts";
import type { ContractStatus } from "@/generated/prisma/enums";

interface ContractActionsProps {
  contractId: string;
  status: ContractStatus;
  endDate: Date;
  monthlyAmount: string; // Decimal serializado
}

export function ContractActions({
  contractId,
  status,
  endDate,
  monthlyAmount,
}: ContractActionsProps) {
  const router = useRouter();
  const [activating, startActivate] = useTransition();
  const [terminating, startTerminate] = useTransition();
  const [renewing, startRenew] = useTransition();

  const [activateOpen, setActivateOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);

  const [terminationDate, setTerminationDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [terminationReason, setTerminationReason] = useState("");

  const [renewEndDate, setRenewEndDate] = useState("");
  const [renewAmount, setRenewAmount] = useState(monthlyAmount);

  function doActivate() {
    startActivate(async () => {
      try {
        const r = await actionActivateContract(contractId);
        toast.success(
          `Contrato activado. Se generaron ${r.rentsCreated} cargos mensuales.`,
        );
        setActivateOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al activar.");
      }
    });
  }

  function doTerminate() {
    if (!terminationReason.trim()) {
      toast.error("Indica el motivo de la terminación.");
      return;
    }
    startTerminate(async () => {
      try {
        await actionTerminateContract(contractId, {
          terminationDate: new Date(terminationDate),
          reason: terminationReason,
        });
        toast.success("Contrato terminado. La unidad quedó disponible.");
        setTerminateOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al terminar.");
      }
    });
  }

  function doRenew() {
    if (!renewEndDate || !renewAmount) {
      toast.error("Completa la nueva fecha y monto.");
      return;
    }
    startRenew(async () => {
      try {
        await actionRenewContract(contractId, {
          newEndDate: new Date(renewEndDate),
          newAmount: Number(renewAmount),
        });
        toast.success("Contrato renovado. Se creó el contrato hijo en borrador.");
        setRenewOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al renovar.");
      }
    });
  }

  const canActivate = status === "DRAFT";
  const canRenew = status === "ACTIVE" || status === "PENDING_RENEWAL";
  const canTerminate =
    status === "ACTIVE" || status === "DRAFT" || status === "PENDING_RENEWAL";

  return (
    <div className="flex flex-wrap gap-2">
      {canActivate ? (
        <Button onClick={() => setActivateOpen(true)} disabled={activating}>
          <CheckCircle2 className="size-4" />
          Activar
        </Button>
      ) : null}
      {canRenew ? (
        <Button
          variant="secondary"
          onClick={() => {
            const next = new Date(endDate);
            next.setUTCFullYear(next.getUTCFullYear() + 1);
            setRenewEndDate(next.toISOString().slice(0, 10));
            setRenewOpen(true);
          }}
          disabled={renewing}
        >
          <RotateCcw className="size-4" />
          Renovar
        </Button>
      ) : null}
      {canTerminate ? (
        <Button
          variant="destructive"
          onClick={() => setTerminateOpen(true)}
          disabled={terminating}
        >
          <XCircle className="size-4" />
          Terminar
        </Button>
      ) : null}

      <AlertDialog open={activateOpen} onOpenChange={setActivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar el contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Al activarlo se generarán los cargos mensuales (Rents) entre la fecha de inicio
              y la fecha de fin. Esta acción es reversible solo terminando el contrato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doActivate();
              }}
              disabled={activating}
            >
              {activating ? "Activando..." : "Activar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={terminateOpen} onOpenChange={setTerminateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminar contrato</DialogTitle>
            <DialogDescription>
              Cambia el estado a TERMINATED, libera la unidad y conserva el historial de
              rentas y pagos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Fecha de terminación</Label>
              <Input
                type="date"
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Motivo</Label>
              <Textarea
                rows={3}
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setTerminateOpen(false)}
              disabled={terminating}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={doTerminate}
              disabled={terminating}
            >
              {terminating ? "Terminando..." : "Terminar contrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renovar contrato</DialogTitle>
            <DialogDescription>
              Crea un contrato hijo en borrador. Arranca el día siguiente al fin del contrato
              actual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nueva fecha de fin</Label>
              <Input
                type="date"
                value={renewEndDate}
                onChange={(e) => setRenewEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Nueva renta mensual (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={renewAmount}
                onChange={(e) => setRenewAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenewOpen(false)} disabled={renewing}>
              Cancelar
            </Button>
            <Button onClick={doRenew} disabled={renewing}>
              {renewing ? "Renovando..." : "Crear renovación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
