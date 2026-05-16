"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
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
import { actionMarkLoanPaymentPaid } from "@/lib/services/inversiones-actions";
import { capitalizeFirst } from "@/lib/utils";

export interface LoanPaymentTarget {
  loanId: string;
  loanPaymentId: string | null;
  loanName: string;
  entityCode: string;
  period: Date;
  amount: number;
}

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

interface Props {
  target: LoanPaymentTarget | null;
  onClose: () => void;
}

export function RegisterLoanPaymentDialog({ target, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!target) return;
    setAmount(target.amount.toFixed(2));
    setNotes("");
  }, [target]);

  function onSubmit() {
    if (!target) return;
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Monto inválido.");
      return;
    }
    startTransition(async () => {
      try {
        await actionMarkLoanPaymentPaid({
          loanId: target.loanId,
          loanPaymentId: target.loanPaymentId,
          period: target.period,
          amount: amountNum,
          notes: notes.trim() || null,
        });
        toast.success("Pago registrado.");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar.");
      }
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago de préstamo</DialogTitle>
          <DialogDescription>
            Confirma el monto pagado. El estimado es{" "}
            <span className="font-medium">
              {target ? MXN.format(target.amount) : ""}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {capitalizeFirst(DATE.format(target.period))}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                {target.entityCode}
              </span>
            </div>
            <div className="mt-1 font-medium">{target.loanName}</div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Monto pagado (MXN)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label>Notas (opcional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="Ej. Folio de transferencia, referencia bancaria..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
