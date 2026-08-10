"use client";

import { Loader2, PlusCircle } from "lucide-react";
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
import { actionRegisterInvestmentPayment } from "@/server/services/inversiones-actions";

interface Props {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}

export function RegisterInvestmentPaymentDialog({ projectId, projectName, open, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isPaid, setIsPaid] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setAmount("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setIsPaid(true);
    setNotes("");
  }, [open]);

  function onSubmit() {
    const amt = Number(amount);
    if (!description.trim()) { toast.error("La descripción es requerida."); return; }
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Monto inválido."); return; }
    if (!paymentDate) { toast.error("La fecha es requerida."); return; }

    startTransition(async () => {
      try {
        await actionRegisterInvestmentPayment({
          projectId,
          description: description.trim(),
          amount: amt,
          paymentDate,
          isPaid,
          notes: notes.trim() || null,
        });
        toast.success("Avance registrado.");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="size-4" />
            Registrar avance
          </DialogTitle>
          <DialogDescription>
            {projectName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Descripción *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Ej. "Anticipo contratista", "Materiales", etc.'
              maxLength={255}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Monto *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Fecha *</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Estado del desembolso</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={isPaid ? "default" : "outline"}
                onClick={() => setIsPaid(true)}
              >
                Pagado
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!isPaid ? "default" : "outline"}
                onClick={() => setIsPaid(false)}
              >
                Pendiente
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Registrar avance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
