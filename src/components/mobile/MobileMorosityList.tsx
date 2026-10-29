"use client";

import { Check, Loader2, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useMobileCapture } from "@/components/mobile/MobileCaptureProvider";
import { MobileCard, MobileEmpty, MobileRentBadge } from "@/components/mobile/MobileUI";
import { formatMXN } from "@/shared/format-currency";
import { formatDate } from "@/shared/format-date";
import { withOrigin } from "@/shared/mobile/nav";
import type { MobileMorosityRow } from "@/server/services/mobile-queries";
import { cn } from "@/shared/utils";

/** Cards de morosidad con envío de avisos 1M/2M/3M (handoff §2b). */
export function MobileMorosityList({ rows }: { rows: MobileMorosityRow[] }) {
  const { canRegisterPayment, openPayment, sendReminder, sendingRentId } = useMobileCapture();

  if (rows.length === 0) {
    return (
      <MobileCard>
        <MobileEmpty>Sin inquilinos en morosidad</MobileEmpty>
      </MobileCard>
    );
  }

  return (
    <>
      {rows.map((m) => {
        const sent = m.lastNoticeAt !== null;
        const sending = sendingRentId === m.noticeRentId;
        const is3M = m.level === "3M";
        return (
          <MobileCard key={m.lesseeId} className="flex flex-col gap-3 p-3.5">
            <Link
              href={withOrigin(`/lessees/${m.lesseeId}`, "morosidad")}
              className="flex items-start gap-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{m.lesseeName}</div>
                <div className="text-xs text-muted-foreground">
                  {m.unitLabel} · {m.rentCount} {m.rentCount === 1 ? "renta" : "rentas"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[15px] font-semibold text-rose-600 tabular-nums">
                  {formatMXN(m.balance)}
                </span>
                <MobileRentBadge status={m.worstStatus} />
              </div>
            </Link>

            {canRegisterPayment ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={sent || sending}
                  onClick={() =>
                    sendReminder({
                      rentId: m.noticeRentId,
                      level: m.level,
                      lesseeName: m.lesseeName,
                      whatsapp: m.whatsapp,
                      balance: m.balance,
                    })
                  }
                  className={cn(
                    "flex h-10 flex-1 items-center justify-center gap-[7px] rounded-[10px] border text-sm font-medium",
                    sent
                      ? "border-green-200 bg-green-50 text-green-700"
                      : is3M
                        ? "border-red-600 bg-red-600 text-white"
                        : "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : sent ? (
                    <Check className="size-4" />
                  ) : (
                    <MessageCircle className="size-4" />
                  )}
                  {sent
                    ? `Aviso enviado ${formatDate(m.lastNoticeAt!)}`
                    : is3M
                      ? "Aviso 3M (desalojo)"
                      : `Enviar aviso ${m.level}`}
                </button>
                <button
                  type="button"
                  onClick={() => openPayment(m.payRent)}
                  className="h-10 rounded-[10px] border border-border bg-card px-3.5 text-sm font-medium text-primary"
                >
                  Registrar pago
                </button>
              </div>
            ) : null}
          </MobileCard>
        );
      })}
    </>
  );
}
