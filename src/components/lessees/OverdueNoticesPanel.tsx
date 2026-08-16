"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RentStatusBadge } from "@/components/shared/RentStatusBadge";
import { SendNotificationDialog } from "@/components/collections/SendNotificationDialog";
import type { LesseeDetail, LesseeOverdueRent } from "@/server/services/lessees-queries";
import type { ReminderLevel } from "@/server/pdf/template-config";
import { formatMXN } from "@/shared/format-currency";
import { formatPeriodLong } from "@/shared/format-date";
import { isPlaza } from "@/shared/i18n/unit-label";

function levelFromStatus(status: LesseeOverdueRent["status"]): ReminderLevel {
  if (status === "OVERDUE_2M") return "2M";
  if (status === "OVERDUE_3M") return "3M";
  return "1M";
}

interface OverdueNoticesPanelProps {
  lessee: Pick<
    LesseeDetail,
    "legalName" | "whatsapp" | "email" | "preferredChannel"
  >;
  rents: ReadonlyArray<LesseeOverdueRent>;
}

export function OverdueNoticesPanel({ lessee, rents }: OverdueNoticesPanelProps) {
  if (rents.length === 0) return null;

  return (
    <div className="rounded-md border bg-amber-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-600" />
        <h3 className="text-sm font-semibold">
          Rentas vencidas — enviar aviso
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {rents.length} pendiente{rents.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <div className="space-y-2">
        {rents.map((r) => {
          const level = levelFromStatus(r.status);
          const balance =
            Number(r.amountDue) - Number(r.amountPaid) - Number(r.amountWaived);
          return (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {r.contract.unit.property.name}
                    {isPlaza(r.contract.unit.property.type) ? (
                      <>
                        {" · "}
                        {r.contract.unit.code}
                        {r.contract.unit.name ? ` — ${r.contract.unit.name}` : ""}
                      </>
                    ) : null}
                  </span>
                  <RentStatusBadge status={r.status} className="text-[11px]" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Periodo {formatPeriodLong(r.period)} ·{" "}
                  <span className="font-semibold text-rose-600 tabular-nums">
                    {formatMXN(balance, 2)}
                  </span>{" "}
                  por cobrar
                </p>
              </div>
              <SendNotificationDialog
                rentId={r.id}
                level={level}
                lessee={{
                  legalName: lessee.legalName,
                  whatsapp: lessee.whatsapp,
                  email: lessee.email,
                  preferredChannel: lessee.preferredChannel,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
