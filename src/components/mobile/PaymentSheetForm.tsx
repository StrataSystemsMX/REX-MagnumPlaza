"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MobileCard } from "@/components/mobile/MobileUI";
import { MobileSheetCta, MobileSwitch } from "@/components/mobile/MobileSheet";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { formatMXN } from "@/shared/format-currency";
import { formatDate, formatPeriodLong } from "@/shared/format-date";
import { todayDateInput, parseAmountInput } from "@/shared/mobile/input";
import type { MobileRent } from "@/server/services/mobile-queries";
import { actionSendPaymentConfirmationManual } from "@/server/services/notifications-actions";
import { actionRegisterPayment } from "@/server/services/payments";
import { cn } from "@/shared/utils";
import { registerPaymentSchema } from "@/shared/validators/payment";

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CASH", label: "Efectivo" },
  { value: "DEPOSIT", label: "Depósito bancario" },
  { value: "CHECK", label: "Cheque" },
];

export function PaymentSheetForm({
  rent,
  autoSendConfirmation,
  onDone,
}: {
  rent: MobileRent;
  /** El tenant ya manda la confirmación solo al quedar PAID (Configuración). */
  autoSendConfirmation: boolean;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(rent.balance > 0 ? rent.balance.toFixed(2) : "");
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [paymentDate, setPaymentDate] = useState(todayDateInput());
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [pending, startTransition] = useTransition();

  const numericAmount = parseAmountInput(amount);

  function submit() {
    const parsed = registerPaymentSchema.safeParse({
      rentId: rent.rentId,
      amount: numericAmount,
      paymentDate,
      method,
    });
    if (!parsed.success) {
      const isAmount = parsed.error.issues.some((i) => i.path[0] === "amount");
      setInvalid(isAmount);
      if (!isAmount) toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setInvalid(false);

    startTransition(async () => {
      try {
        const result = await actionRegisterPayment(parsed.data);
        const parts = [`Pago de ${formatMXN(parsed.data.amount, 2)} registrado · ${rent.lesseeName}.`];

        // Con auto-envío activo, actionRegisterPayment ya despachó la
        // confirmación; solo la mandamos a mano si el tenant lo tiene apagado.
        if (result.rentStatus === "PAID" && (autoSendConfirmation || sendConfirmation)) {
          if (autoSendConfirmation) {
            parts.push("Confirmación enviada por WhatsApp.");
          } else {
            const notice = await actionSendPaymentConfirmationManual(result.payment.id);
            if (notice.status === "SENT") parts.push("Confirmación enviada por WhatsApp.");
            else toast.warning(`No se pudo enviar la confirmación: ${notice.failureReason ?? "error desconocido"}`);
          }
        }
        toast.success(parts.join(" "));
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar el pago.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <MobileCard className="flex flex-col items-center gap-1 p-4">
        <label
          htmlFor="mobile-pay-amount"
          className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
        >
          Monto (MXN)
        </label>
        <div className="flex items-baseline gap-0.5">
          <span className="text-[30px] font-semibold text-muted-foreground">$</span>
          <input
            id="mobile-pay-amount"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setInvalid(false);
            }}
            inputMode="decimal"
            autoComplete="off"
            className="w-[220px] bg-transparent text-center text-[38px] font-semibold tracking-[-0.02em] tabular-nums outline-none"
          />
        </div>
        <span className="text-[12.5px] text-muted-foreground">
          Saldo {formatMXN(rent.balance, 2)} · {formatPeriodLong(rent.period)}
        </span>
        <button
          type="button"
          onClick={() => setAmount(rent.balance.toFixed(2))}
          className="mt-1.5 rounded-full border border-border bg-background px-3 py-1 text-[12.5px] font-medium text-primary"
        >
          Liquidar saldo
        </button>
      </MobileCard>

      <div className="flex flex-col gap-2">
        <span className="px-1 text-[13px] font-medium">Método</span>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={method === m.value}
              onClick={() => setMethod(m.value)}
              className={cn(
                "h-[42px] rounded-[10px] border text-sm font-medium",
                method === m.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <MobileCard className="overflow-hidden">
        <label className="relative flex items-center justify-between border-b border-muted px-3.5 py-3 text-sm">
          <span className="text-muted-foreground">Fecha de pago</span>
          <span className="font-medium">{paymentDate ? formatDate(paymentDate) : "—"}</span>
          {/* Input nativo invisible sobre la fila: abre el date picker de iOS. */}
          <input
            type="date"
            value={paymentDate}
            max={todayDateInput()}
            onChange={(e) => setPaymentDate(e.target.value)}
            aria-label="Fecha de pago"
            className="absolute inset-0 opacity-0"
          />
        </label>
        <div className="flex items-center justify-between border-b border-muted px-3.5 py-3 text-sm">
          <span className="text-muted-foreground">Razón social</span>
          <span className="font-medium">{rent.legalEntityCode}</span>
        </div>
        <MobileSwitch
          checked={autoSendConfirmation || sendConfirmation}
          onChange={setSendConfirmation}
          disabled={autoSendConfirmation}
          label="Enviar confirmación por WhatsApp"
          hint={autoSendConfirmation ? "Automática (Configuración)" : "Al liquidar la renta"}
        />
      </MobileCard>

      {invalid ? (
        <div className="px-1 text-[12.5px] text-rose-600">Ingresa un monto mayor a $0.</div>
      ) : null}

      <MobileSheetCta onClick={submit} disabled={pending}>
        {pending ? (
          <Loader2 className="mx-auto size-5 animate-spin" />
        ) : (
          `Registrar ${formatMXN(numericAmount > 0 ? numericAmount : 0, 2)}`
        )}
      </MobileSheetCta>
    </div>
  );
}
