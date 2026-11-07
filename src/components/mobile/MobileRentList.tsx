"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMobileCapture } from "@/components/mobile/MobileCaptureProvider";
import { MobileCard, MobileEmpty, MobileRentBadge } from "@/components/mobile/MobileUI";
import { formatMXN } from "@/shared/format-currency";
import { isOverdueStatus, isPayableStatus, propertyAbbr } from "@/shared/mobile/format";
import { withOrigin } from "@/shared/mobile/nav";
import type { MobileRent } from "@/server/services/mobile-queries";
import { cn } from "@/shared/utils";

/**
 * Lista "Mes en curso". Tap en renta cobrable → sheet Registrar pago
 * (si el perfil puede registrar pagos); en pagada → detalle del inquilino.
 */
export function MobileRentList({ rents }: { rents: MobileRent[] }) {
  const router = useRouter();
  const { canRegisterPayment, openPayment } = useMobileCapture();

  return (
    <MobileCard className="overflow-hidden">
      {rents.map((r) => {
        const payable = isPayableStatus(r.status);
        const overdue = isOverdueStatus(r.status);
        const sub =
          r.status === "PAID"
            ? `Pagado ${formatMXN(r.amountPaid)}`
            : r.amountPaid > 0
              ? `Pagado ${formatMXN(r.amountPaid)} de ${formatMXN(r.amountDue)}`
              : `Renta ${formatMXN(r.amountDue)}`;
        return (
          <button
            key={r.rentId}
            type="button"
            onClick={() =>
              payable && canRegisterPayment
                ? openPayment(r)
                : router.push(withOrigin(`/lessees/${r.lesseeId}`, "cobranza"))
            }
            className="flex w-full items-center gap-3 border-b border-muted px-3.5 py-3 text-left last:border-b-0 active:bg-background"
          >
            <div className="flex size-10 flex-none flex-col items-center justify-center rounded-[10px] bg-secondary leading-[1.05] text-primary">
              <span className="text-[13px] font-semibold">{r.unitCode}</span>
              <span className="max-w-full truncate px-0.5 text-[9px] opacity-75">{propertyAbbr(r.propertyName)}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{r.lesseeName}</span>
              <span className="truncate text-xs text-muted-foreground">{sub}</span>
            </div>
            <div className="flex flex-none flex-col items-end gap-1">
              {r.status === "PAID" ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
                  <Check className="size-3.5" />
                  {formatMXN(r.amountPaid)}
                </span>
              ) : (
                <span className={cn("text-sm font-semibold tabular-nums", overdue && "text-rose-600")}>
                  {formatMXN(r.balance)}
                </span>
              )}
              <MobileRentBadge status={r.status} />
            </div>
          </button>
        );
      })}
      {rents.length === 0 ? <MobileEmpty>Sin rentas en este filtro</MobileEmpty> : null}
    </MobileCard>
  );
}
