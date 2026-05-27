"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SendNotificationDialog } from "@/components/collections/SendNotificationDialog";
import type { LesseeDetail, LesseeOverdueRent } from "@/lib/services/lessees-queries";
import type { ReminderLevel } from "@/lib/pdf/template-config";
import { capitalizeFirst } from "@/lib/utils";
import { isPlaza } from "@/lib/i18n/unit-label";

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

function levelFromStatus(status: LesseeOverdueRent["status"]): ReminderLevel {
  if (status === "OVERDUE_2M") return "2M";
  if (status === "OVERDUE_3M") return "3M";
  return "1M";
}

function levelBadge(level: ReminderLevel) {
  if (level === "3M") {
    return { label: "3 meses", cls: "bg-red-600 text-white" };
  }
  if (level === "2M") {
    return { label: "2 meses", cls: "bg-red-100 text-red-700" };
  }
  return { label: "1 mes", cls: "bg-orange-100 text-orange-700" };
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
          const badge = levelBadge(level);
          const balance = Number(r.amountDue) - Number(r.amountPaid);
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
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Periodo {capitalizeFirst(PERIOD.format(r.period))} ·{" "}
                  <span className="font-semibold text-rose-600 tabular-nums">
                    {MXN.format(balance)}
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
