"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { EnumSelect } from "@/components/ui/enum-select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { paymentMethodLabel, rentStatusLabel } from "@/lib/i18n/enums";
import { actionRegisterPayment } from "@/lib/services/payments";
import { registerPaymentSchema } from "@/lib/validators/payment";
import type { PaymentMethod } from "@/generated/prisma/enums";

const METHODS: ReadonlyArray<PaymentMethod> = [
  "TRANSFER",
  "CASH",
  "CHECK",
  "DEPOSIT",
  "CARD",
  "OTHER",
];

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const PERIOD = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

export interface RegisterPaymentDialogContext {
  rentId: string;
  amountDue: string;
  amountPaid: string;
  period: Date;
  lesseeName: string;
  unitLabel: string;
}

interface RegisterPaymentDialogProps {
  context: RegisterPaymentDialogContext | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RegisterPaymentDialog({
  context,
  open,
  onOpenChange,
}: RegisterPaymentDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const balance = context
    ? Number(context.amountDue) - Number(context.amountPaid)
    : 0;

  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && context) {
      setAmount(balance > 0 ? balance.toFixed(2) : context.amountDue);
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setMethod("TRANSFER");
      setReference("");
      setNotes("");
    }
  }, [open, context, balance]);

  if (!context) return null;

  const numericAmount = Number(amount) || 0;
  const overpay = numericAmount > balance ? numericAmount - balance : 0;

  function onSubmit() {
    if (!context) return;
    const parsed = registerPaymentSchema.safeParse({
      rentId: context.rentId,
      amount: Number(amount),
      paymentDate,
      method,
      reference: reference || undefined,
      notes: notes || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await actionRegisterPayment(parsed.data);
        const statusLabel = rentStatusLabel(result.rentStatus as Parameters<typeof rentStatusLabel>[0]);
        const parts = [
          `Pago de ${MXN.format(parsed.data.amount)} registrado. Renta queda ${statusLabel.toLowerCase()}.`,
        ];
        if (result.cascade.length > 0) {
          const months = result.cascade
            .map((c) => PERIOD.format(c.period))
            .join(", ");
          parts.push(
            `Sobrante aplicado a ${result.cascade.length} mensualidad${result.cascade.length === 1 ? "" : "es"} (${months}).`,
          );
        }
        if (result.remainderApplied > 0) {
          parts.push(
            `Quedó ${MXN.format(result.remainderApplied)} a favor.`,
          );
        }
        toast.success(parts.join(" "));
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar el pago.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {context.lesseeName} · {context.unitLabel} ·{" "}
            {PERIOD.format(context.period)}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-secondary/30 p-3 text-sm">
          <Row label="Cargo del mes">{MXN.format(Number(context.amountDue))}</Row>
          <Row label="Ya pagado">{MXN.format(Number(context.amountPaid))}</Row>
          <Row label="Saldo pendiente">
            <span className="font-semibold">{MXN.format(balance)}</span>
          </Row>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Monto a pagar (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Método</Label>
              <EnumSelect
                values={METHODS}
                labelFor={paymentMethodLabel}
                value={method}
                onValueChange={(v) => setMethod(v)}
              />
            </div>
            <div className="space-y-1">
              <Label>Referencia</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {overpay > 0 ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
              <strong>Pago en exceso:</strong> {MXN.format(overpay)}. Se aplicará a
              pagos pendientes; si no hay, se abonara a las siguientes mensualidades.
            </div>
          ) : null}
        </div>

        <Separator />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? "Registrando..." : "Registrar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
