"use client";

import { CircleSlash, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PaymentMethod } from "@/generated/prisma/enums";
import {
  actionRegisterExpense,
  actionToggleExpenseNotRequired,
} from "@/lib/services/expenses";
import { capitalizeFirst } from "@/lib/utils";

export interface RegisterExpenseContext {
  id: string;
  amount: number;
  expenseDate: Date;
  description: string;
  categoryName: string;
  legalEntityCode: string;
  paymentMethod: PaymentMethod | null;
  /** Si está marcado como "Sin egreso", el botón cambia a "Quitar Sin egreso". */
  isNotRequired: boolean;
}

const PAYMENT_METHOD_NONE = "__NONE__";

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  DEPOSIT: "Depósito",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

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
  target: RegisterExpenseContext | null;
  onClose: () => void;
}

export function RegisterExpenseDialog({ target, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const open = target !== null;

  useEffect(() => {
    if (!target) return;
    setAmount(target.amount.toFixed(2));
    setPaymentMethod(target.paymentMethod ?? PaymentMethod.TRANSFER);
    setNotes("");
  }, [target]);

  const paymentMethodItems = useMemo<Record<string, string>>(
    () => ({
      [PAYMENT_METHOD_NONE]: "— No especificar —",
      ...PAYMENT_METHOD_LABEL,
    }),
    [],
  );

  function onSubmit() {
    if (!target) return;
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Monto inválido.");
      return;
    }

    startTransition(async () => {
      try {
        await actionRegisterExpense({
          id: target.id,
          amount: amountNum,
          paymentMethod:
            paymentMethod && paymentMethod !== PAYMENT_METHOD_NONE
              ? (paymentMethod as PaymentMethod)
              : null,
          notes: notes.trim() || null,
        });
        toast.success("Egreso registrado.");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar.");
      }
    });
  }

  function onToggleNotRequired() {
    if (!target) return;
    const wasNotRequired = target.isNotRequired;
    startTransition(async () => {
      try {
        await actionToggleExpenseNotRequired({ id: target.id });
        toast.success(
          wasNotRequired
            ? "Egreso quitado de Sin egreso."
            : "Egreso marcado como Sin egreso.",
        );
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar egreso</DialogTitle>
          <DialogDescription>
            Indica el monto real que se pagó este mes. El estimado actual es{" "}
            <span className="font-medium">
              {target ? MXN.format(target.amount) : ""}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        {target ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {capitalizeFirst(DATE.format(target.expenseDate))}
              </span>
              <span className="font-medium">{target.legalEntityCode}</span>
            </div>
            <div className="mt-1 font-medium">{target.description}</div>
            <div className="text-xs text-muted-foreground">
              {target.categoryName}
            </div>
          </div>
        ) : null}

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
            <Label>Forma de pago</Label>
            <Select
              value={paymentMethod || PAYMENT_METHOD_NONE}
              onValueChange={(v) => {
                if (!v) return;
                setPaymentMethod(v === PAYMENT_METHOD_NONE ? "" : v);
              }}
              items={paymentMethodItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PAYMENT_METHOD_NONE}>
                  — No especificar —
                </SelectItem>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map(
                  (k) => (
                    <SelectItem key={k} value={k}>
                      {PAYMENT_METHOD_LABEL[k]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Notas (opcional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="Ej. Folio de transferencia, observaciones..."
            />
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleNotRequired}
            disabled={pending}
          >
            <CircleSlash className="size-4" />
            {target?.isNotRequired
              ? "Quitar Sin egreso"
              : "No Requiere Egreso"}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Registrar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
