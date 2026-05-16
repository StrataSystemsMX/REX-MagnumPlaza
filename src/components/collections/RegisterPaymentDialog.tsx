"use client";

import { ArrowLeft, Ban, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { paymentMethodLabel, rentStatusLabel } from "@/lib/i18n/enums";
import {
  actionCanWaiveRent,
  actionRegisterPayment,
  actionWaiveRents,
} from "@/lib/services/payments";
import { registerPaymentSchema } from "@/lib/validators/payment";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { capitalizeFirst, cn } from "@/lib/utils";

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
  /** Monto ya condonado de esta renta. Optional para compatibilidad con
   *  call-sites antiguos; cuando es > 0 la UI muestra una nota. */
  amountWaived?: string;
  period: Date;
  lesseeName: string;
  unitLabel: string;
}

interface RegisterPaymentDialogProps {
  context: RegisterPaymentDialogContext | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = "pay" | "waive";

export function RegisterPaymentDialog({
  context,
  open,
  onOpenChange,
}: RegisterPaymentDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [waiving, startWaive] = useTransition();

  const waivedAmount = context ? Number(context.amountWaived ?? 0) : 0;
  const balance = context
    ? Number(context.amountDue) - Number(context.amountPaid) - waivedAmount
    : 0;

  const [mode, setMode] = useState<Mode>("pay");

  // ----- Modo PAGO -----
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // ----- Modo CONDONAR -----
  const [canWaive, setCanWaive] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");
  const [waiveAmount, setWaiveAmount] = useState("");

  useEffect(() => {
    if (open && context) {
      setMode("pay");
      setAmount(balance > 0 ? balance.toFixed(2) : "0.00");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setMethod("TRANSFER");
      setReference("");
      setNotes("");
      setWaiveReason("");
      // Si ya tiene condonación: el input arranca con ese valor (semántica replace).
      // Si no: arranca con el saldo completo (sugerencia de condonación total).
      setWaiveAmount(
        waivedAmount > 0
          ? waivedAmount.toFixed(2)
          : balance > 0
            ? balance.toFixed(2)
            : "0.00",
      );
      actionCanWaiveRent()
        .then(setCanWaive)
        .catch(() => setCanWaive(false));
    }
  }, [open, context, balance, waivedAmount]);

  if (!context) return null;

  const numericAmount = Number(amount) || 0;
  const overpay = numericAmount > balance ? numericAmount - balance : 0;
  const hasNoBalance = balance <= 0;
  const exceedsBalance = numericAmount > balance + 0.0001;

  // Para condonar (REPLACE semantics): el máximo es lo que NO se ha pagado.
  // El "amountWaived" actual no cuenta porque lo estás reemplazando.
  const maxWaivable =
    Number(context.amountDue) - Number(context.amountPaid);
  const numericWaiveAmount = Number(waiveAmount) || 0;
  const waiveExceedsBalance = numericWaiveAmount > maxWaivable + 0.0001;
  const newBalanceAfterWaive = Math.max(0, maxWaivable - numericWaiveAmount);
  const waiveChanged =
    Math.abs(numericWaiveAmount - waivedAmount) > 0.0001;

  function submitWaive(targetAmount: number, isRemoval: boolean) {
    if (!context) return;
    const typed = waiveReason.trim();
    // Para REMOVER no requerimos motivo del usuario — usamos uno por defecto si
    // no escribió nada. Para AGREGAR/EDITAR sí lo seguimos exigiendo.
    const reason = isRemoval
      ? typed.length >= 5
        ? typed
        : "Condonación removida por el operador."
      : typed;
    if (!isRemoval && reason.length < 5) {
      toast.error("Indica el motivo de la condonación (mínimo 5 caracteres).");
      return;
    }
    if (!isRemoval && targetAmount > maxWaivable + 0.0001) {
      toast.error(
        `El monto excede lo condonable (máx ${MXN.format(maxWaivable)}).`,
      );
      return;
    }

    startWaive(async () => {
      try {
        await actionWaiveRents({
          items: [{ rentId: context.rentId, amount: targetAmount }],
          reason,
        });
        toast.success(
          isRemoval
            ? `Condonación removida en ${capitalizeFirst(PERIOD.format(context.period))}.`
            : `Condonación aplicada: ${MXN.format(targetAmount)} en ${capitalizeFirst(PERIOD.format(context.period))}.`,
        );
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al condonar.");
      }
    });
  }

  function doWaive() {
    submitWaive(numericWaiveAmount, false);
  }

  function doRemoveWaive() {
    submitWaive(0, true);
  }

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
            .map((c) => capitalizeFirst(PERIOD.format(c.period)))
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

  const isWaive = mode === "waive";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg gap-3 overflow-x-hidden">
        <DialogHeader className="min-w-0 gap-1 pr-8">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            {isWaive ? (
              <>
                <Ban className="size-4 shrink-0 text-blue-600" />
                <span className="truncate">
                  {waivedAmount > 0 ? "Editar condonación" : "Condonar renta"}
                </span>
              </>
            ) : (
              "Registrar pago"
            )}
          </DialogTitle>
          <DialogDescription className="truncate">
            {context.lesseeName} · {context.unitLabel}
            {!isWaive ? (
              <> · {capitalizeFirst(PERIOD.format(context.period))}</>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {!isWaive ? (
          <>
            <div className="rounded-md border bg-secondary/30 p-3 text-sm">
              <Row label="Cargo del mes">{MXN.format(Number(context.amountDue))}</Row>
              {waivedAmount > 0 ? (
                <Row label="Condonado">
                  <span className="font-medium text-blue-700 dark:text-blue-300">
                    − {MXN.format(waivedAmount)}
                  </span>
                </Row>
              ) : null}
              <Row label="Ya pagado">{MXN.format(Number(context.amountPaid))}</Row>
              <Row label={waivedAmount > 0 ? "Nuevo saldo a pagar" : "Saldo pendiente"}>
                <span className="font-semibold">{MXN.format(balance)}</span>
              </Row>
            </div>
            {waivedAmount > 0 ? (
              <div className="-mt-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                Esta renta fue condonada por{" "}
                <span className="font-semibold">{MXN.format(waivedAmount)}</span>.
                Se cobrará el saldo restante.
              </div>
            ) : null}

            <div className="space-y-3">
              {hasNoBalance ? (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                  Esta renta no tiene saldo pendiente. No se puede registrar un pago adicional.
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Monto a pagar (MXN)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={balance > 0 ? balance : undefined}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={hasNoBalance}
                    className={cn(
                      exceedsBalance &&
                        "border-destructive focus-visible:ring-destructive/40",
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Fecha de pago</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    disabled={hasNoBalance}
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
                    disabled={hasNoBalance}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Referencia</Label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={hasNoBalance}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notas</Label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={hasNoBalance}
                />
              </div>

              {!hasNoBalance && overpay > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <strong>Excede el saldo en {MXN.format(overpay)}.</strong> El sobrante se aplicará
                  a las siguientes mensualidades pendientes del contrato.
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border bg-secondary/30 p-3 text-sm">
              <Row label="Mes">
                <span className="font-medium">
                  {capitalizeFirst(PERIOD.format(context.period))}
                </span>
              </Row>
              <Row label="Cargo del mes">
                <span className="tabular-nums">
                  {MXN.format(Number(context.amountDue))}
                </span>
              </Row>
              {Number(context.amountPaid) > 0 ? (
                <Row label="Ya pagado">
                  <span className="tabular-nums">
                    {MXN.format(Number(context.amountPaid))}
                  </span>
                </Row>
              ) : null}
              {waivedAmount > 0 ? (
                <Row label="Condonación actual">
                  <span className="font-medium text-blue-700 dark:text-blue-300">
                    {MXN.format(waivedAmount)}
                  </span>
                </Row>
              ) : null}
              <Row label="Saldo tras la condonación">
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    newBalanceAfterWaive === 0 &&
                      "text-blue-700 dark:text-blue-300",
                  )}
                >
                  {MXN.format(newBalanceAfterWaive)}
                </span>
              </Row>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">
                  {waivedAmount > 0 ? "Nueva condonación (MXN)" : "Monto a condonar (MXN)"}
                </Label>
                <button
                  type="button"
                  onClick={() => setWaiveAmount(maxWaivable.toFixed(2))}
                  className="shrink-0 text-[11px] font-medium text-blue-700 hover:underline dark:text-blue-300"
                  disabled={waiving}
                >
                  Todo
                </button>
              </div>
              <Input
                type="text"
                inputMode="decimal"
                value={waiveAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) {
                    setWaiveAmount(v);
                  }
                }}
                onFocus={(e) => {
                  const el = e.target;
                  requestAnimationFrame(() => {
                    const len = el.value.length;
                    el.setSelectionRange(len, len);
                  });
                }}
                onClick={(e) => {
                  const el = e.currentTarget;
                  const len = el.value.length;
                  el.setSelectionRange(len, len);
                }}
                disabled={waiving}
                className={cn(
                  "text-left tabular-nums",
                  waiveExceedsBalance &&
                    "border-destructive focus-visible:ring-destructive/40",
                )}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Motivo</Label>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {waiveReason.length}/500
                </span>
              </div>
              <Textarea
                rows={2}
                value={waiveReason}
                onChange={(e) => setWaiveReason(e.target.value)}
                placeholder="Ej.: Acuerdo verbal por obras."
                maxLength={500}
                disabled={waiving}
                className="resize-none"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {!isWaive ? (
            canWaive && (balance > 0 || waivedAmount > 0) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMode("waive")}
                disabled={pending}
                className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950"
              >
                <Ban className="size-4" />
                {waivedAmount > 0 ? "Editar condonación" : "Condonar"}
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("pay")}
                disabled={waiving}
              >
                <ArrowLeft className="size-4" />
                Volver
              </Button>
              {waivedAmount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={doRemoveWaive}
                  disabled={waiving}
                  className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Quitar condonación
                </Button>
              ) : null}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending || waiving}
            >
              Cancelar
            </Button>
            {!isWaive ? (
              <Button
                size="sm"
                onClick={onSubmit}
                disabled={pending || hasNoBalance || numericAmount <= 0}
              >
                {pending ? "Registrando..." : "Registrar pago"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={doWaive}
                disabled={
                  waiving ||
                  numericWaiveAmount <= 0 ||
                  waiveExceedsBalance ||
                  !waiveChanged
                }
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                <Ban className="size-4" />
                {waiving
                  ? "Guardando..."
                  : waivedAmount > 0
                    ? `Guardar ${MXN.format(numericWaiveAmount)}`
                    : `Condonar ${MXN.format(numericWaiveAmount)}`}
              </Button>
            )}
          </div>
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
