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
import { actionRegisterCadastralPayment } from "@/lib/services/cadastral";
import type { CadastralListItem } from "@/lib/services/cadastral-queries";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

interface Props {
  target: CadastralListItem | null;
  onClose: () => void;
}

export function PredialRegisterPaymentDialog({ target, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [paidAmount, setPaidAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!target) return;
    setPaidAmount(
      target.totalAmount !== null ? target.totalAmount.toFixed(2) : "",
    );
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setNotes("");
  }, [target]);

  if (!target) return null;

  function onSubmit() {
    if (!target) return;
    const amt = Number(paidAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Monto inválido.");
      return;
    }
    startTransition(async () => {
      try {
        await actionRegisterCadastralPayment({
          id: target.id,
          paidAmount: amt,
          paymentDate: new Date(paymentDate),
          notes: notes.trim() || null,
        });
        toast.success("Pago registrado.");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago de predial</DialogTitle>
          <DialogDescription>
            {target.propertyName} · {target.year}
            {target.cadastralKey ? ` · clave ${target.cadastralKey}` : ""}
          </DialogDescription>
        </DialogHeader>

        {target.totalAmount !== null ? (
          <div className="rounded-md border bg-secondary/30 p-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase text-muted-foreground">
                Monto del predial
              </span>
              <span className="font-semibold tabular-nums">
                {MXN.format(target.totalAmount)}
              </span>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Este predial aún no tiene monto registrado. Indica el monto pagado
            abajo.
          </p>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Monto pagado (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Fecha de pago</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Folio, banco, observaciones (opcional)."
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Registrar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
