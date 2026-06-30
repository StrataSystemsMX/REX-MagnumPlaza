"use client";

import { CheckCircle2, Pencil, RotateCcw, XCircle } from "lucide-react";
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
import { EnumSelect } from "@/components/ui/enum-select";
import { CharacterCount } from "@/components/ui/character-count";
import { contractTypeLabel } from "@/lib/i18n/enums";
import {
  actionActivateContract,
  actionRenewContract,
  actionTerminateContract,
  actionUpdateContract,
} from "@/lib/services/contracts";
import type { ContractStatus, ContractType } from "@/generated/prisma/enums";

const CONTRACT_TYPES: ReadonlyArray<ContractType> = [
  "ARRENDAMIENTO",
  "COMODATO",
  "ADMINISTRACION_INTERNA",
  "COMPRAVENTA",
];

/** Valores actuales del contrato para precargar el formulario de edición. */
export interface ContractEditInitial {
  type: ContractType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  monthlyAmount: string;
  guaranteeAmount: string;
  paymentDay: string;
  lateFeePercentage: string;
  autoRenew: boolean;
  friendlyReminderEnabled: boolean;
  paidInAdvance: boolean;
  advancePaidUntil: string; // YYYY-MM-DD o ""
}

interface ContractActionsProps {
  contractId: string;
  status: ContractStatus;
  endDate: Date;
  monthlyAmount: string; // Decimal serializado
  editInitial: ContractEditInitial;
}

export function ContractActions({
  contractId,
  status,
  endDate,
  monthlyAmount,
  editInitial,
}: ContractActionsProps) {
  const router = useRouter();
  const [activating, startActivate] = useTransition();
  const [terminating, startTerminate] = useTransition();
  const [renewing, startRenew] = useTransition();
  const [editing, startEdit] = useTransition();

  const [activateOpen, setActivateOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ContractEditInitial>(editInitial);

  function setField<K extends keyof ContractEditInitial>(
    key: K,
    value: ContractEditInitial[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openEdit() {
    setForm(editInitial); // re-sincroniza con los valores actuales al abrir
    setEditOpen(true);
  }

  function doEdit() {
    if (!form.startDate || !form.endDate) {
      toast.error("Indica las fechas de inicio y fin.");
      return;
    }
    if (new Date(form.endDate).getTime() <= new Date(form.startDate).getTime()) {
      toast.error("La fecha de fin debe ser posterior a la de inicio.");
      return;
    }
    if (Number(form.monthlyAmount) <= 0) {
      toast.error("La renta mensual debe ser mayor a 0.");
      return;
    }
    if (form.paidInAdvance && !form.advancePaidUntil) {
      toast.error("Indica hasta qué fecha está pagado por adelantado.");
      return;
    }
    startEdit(async () => {
      try {
        const { reconcile } = await actionUpdateContract(contractId, {
          type: form.type,
          startDate: new Date(form.startDate),
          endDate: new Date(form.endDate),
          monthlyAmount: Number(form.monthlyAmount),
          guaranteeAmount: Number(form.guaranteeAmount || 0),
          paymentDay: Number(form.paymentDay),
          lateFeePercentage:
            form.lateFeePercentage === "" ? undefined : Number(form.lateFeePercentage),
          autoRenew: form.autoRenew,
          friendlyReminderEnabled: form.friendlyReminderEnabled,
          paidInAdvance: form.paidInAdvance,
          advancePaidUntil:
            form.paidInAdvance && form.advancePaidUntil
              ? new Date(form.advancePaidUntil)
              : undefined,
        });

        let msg = "Contrato actualizado.";
        if (reconcile) {
          const bits: string[] = [];
          if (reconcile.created) bits.push(`${reconcile.created} cargo(s) nuevo(s)`);
          if (reconcile.removed) bits.push(`${reconcile.removed} eliminado(s)`);
          if (reconcile.resynced) bits.push(`${reconcile.resynced} actualizado(s)`);
          if (bits.length) msg += ` Rentas: ${bits.join(", ")}.`;
          if (reconcile.keptWithPayments) {
            msg += ` ${reconcile.keptWithPayments} renta(s) fuera de rango con pagos se conservaron.`;
          }
        }
        toast.success(msg);
        setEditOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al editar el contrato.");
      }
    });
  }

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
  // Solo tiene sentido editar mientras el contrato sigue vigente o en borrador.
  const canEdit =
    status === "DRAFT" || status === "ACTIVE" || status === "PENDING_RENEWAL";

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit ? (
        <Button variant="outline" onClick={openEdit} disabled={editing}>
          <Pencil className="size-4" />
          Editar
        </Button>
      ) : null}
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
                maxLength={1000}
                onChange={(e) => setTerminationReason(e.target.value)}
              />
              <CharacterCount current={terminationReason.length} max={1000} />
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar contrato</DialogTitle>
            <DialogDescription>
              {status === "ACTIVE"
                ? "Si cambias fechas, monto, día de cobro o el pago adelantado, las rentas se re-sincronizan automáticamente. Las rentas ya pagadas o condonadas se conservan."
                : "El contrato está en borrador; los cambios se aplicarán al activarlo."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Tipo de contrato</Label>
              <EnumSelect
                values={CONTRACT_TYPES}
                labelFor={contractTypeLabel}
                value={form.type}
                onValueChange={(v) => setField("type", v)}
                placeholder="Tipo"
              />
            </div>
            <div className="space-y-1">
              <Label>Día de cobro (1-28)</Label>
              <Input
                type="number"
                min="1"
                max="28"
                value={form.paymentDay}
                onChange={(e) => setField("paymentDay", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Fecha inicio</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Fecha fin</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setField("endDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Renta mensual (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.monthlyAmount}
                onChange={(e) => setField("monthlyAmount", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Fianza (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.guaranteeAmount}
                onChange={(e) => setField("guaranteeAmount", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Interés moratorio (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.lateFeePercentage}
                onChange={(e) => setField("lateFeePercentage", e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.autoRenew}
                  onChange={(e) => setField("autoRenew", e.target.checked)}
                />
                Auto-renovar al vencer
              </label>
            </div>
            <div className="md:col-span-2 flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.friendlyReminderEnabled}
                  onChange={(e) => setField("friendlyReminderEnabled", e.target.checked)}
                />
                Recordatorio amable al 1er mes de atraso (el aviso fuerte a los 2
                meses se manda siempre)
              </label>
            </div>

            <div className="md:col-span-2 space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.paidInAdvance}
                  onChange={(e) => setField("paidInAdvance", e.target.checked)}
                />
                Pago adelantado
              </label>
              {form.paidInAdvance ? (
                <div className="space-y-1">
                  <Label>Pagado hasta</Label>
                  <Input
                    type="date"
                    value={form.advancePaidUntil}
                    onChange={(e) => setField("advancePaidUntil", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Todos los meses hasta esta fecha (incluido el mes seleccionado) se
                    marcarán como pagados. Los meses ya pagados o condonados no se
                    modifican.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={editing}>
              Cancelar
            </Button>
            <Button onClick={doEdit} disabled={editing}>
              {editing ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
