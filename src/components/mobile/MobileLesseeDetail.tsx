import { MessageCircle } from "lucide-react";
import { MobileLesseeActions } from "@/components/mobile/MobileLesseeActions";
import {
  MobileBackLink,
  MobileCard,
  MobileKpiLabel,
  MobilePill,
  MobileRentBadge,
  MobileScreen,
  MobileSectionTitle,
  contractPill,
} from "@/components/mobile/MobileUI";
import { rentStatusClasses } from "@/components/shared/RentStatusBadge";
import { formatMXN } from "@/shared/format-currency";
import { formatDate, formatMonthShort } from "@/shared/format-date";
import { notificationStatusLabel } from "@/shared/i18n/enums";
import { initials } from "@/shared/mobile/format";
import type { MobileLesseeDetail as Detail } from "@/server/services/mobile-queries";
import { cn } from "@/shared/utils";

const NOTICE_LABEL: Record<string, string> = {
  RENT_REMINDER_1M: "Aviso 1M · amistoso",
  RENT_REMINDER_2M: "Aviso 2M · formal",
  RENT_REMINDER_3M_LEGAL: "Aviso 3M · desalojo",
};

export function MobileLesseeDetail({
  lessee,
  back,
}: {
  lessee: Detail;
  back: { href: string; label: string };
}) {
  const pill = lessee.contract ? contractPill(lessee.contract) : null;

  return (
    <MobileScreen>
      <MobileBackLink href={back.href} label={back.label} />

      <div className="flex items-center gap-3.5 px-1">
        <div className="flex size-14 flex-none items-center justify-center rounded-2xl bg-primary font-heading text-[19px] font-bold text-primary-foreground">
          {initials(lessee.legalName)}
        </div>
        <div className="min-w-0">
          <h1 className="font-heading text-[21px] font-bold leading-tight">{lessee.legalName}</h1>
          <div className="text-[13px] text-muted-foreground">{lessee.location}</div>
        </div>
      </div>

      <MobileCard className="flex flex-col gap-3.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <MobileKpiLabel>Saldo pendiente</MobileKpiLabel>
            <div
              className={cn(
                "text-[28px] font-semibold tracking-[-0.02em] tabular-nums",
                lessee.balance > 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
              {formatMXN(lessee.balance, 2)}
            </div>
          </div>
          {lessee.status ? <MobileRentBadge status={lessee.status} /> : null}
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {lessee.history.map((h) => (
            <div key={h.period} className="flex flex-col items-center gap-1">
              <div
                title={h.status ?? "Sin renta"}
                className={cn(
                  "h-7 w-full rounded-[6px] border",
                  h.status ? rentStatusClasses(h.status) : "border-dashed border-border",
                )}
              />
              <span className="text-[10.5px] text-muted-foreground">{formatMonthShort(h.period)}</span>
            </div>
          ))}
        </div>
      </MobileCard>

      <MobileLesseeActions
        payRent={lessee.payRent}
        whatsapp={lessee.whatsapp}
        phone={lessee.phone ?? lessee.whatsapp}
      />

      {lessee.contract ? (
        <MobileCard className="overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <MobileSectionTitle>Contrato</MobileSectionTitle>
            {pill ? <MobilePill className={pill.className}>{pill.label}</MobilePill> : null}
          </div>
          {[
            ["Renta mensual", formatMXN(lessee.contract.monthlyAmount, 2)],
            ["Inicio", formatDate(lessee.contract.startDate)],
            ["Fin", formatDate(lessee.contract.endDate)],
            ["Depósito en garantía", formatMXN(lessee.contract.guaranteeAmount, 2)],
            ["Factura", lessee.contract.managerEntityCode],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between border-t border-muted px-4 py-2.5 text-sm"
            >
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium tabular-nums">{v}</span>
            </div>
          ))}
        </MobileCard>
      ) : null}

      <MobileCard className="flex flex-col gap-1 p-4">
        <MobileSectionTitle className="mb-1">Avisos enviados</MobileSectionTitle>
        {lessee.notices.length > 0 ? (
          lessee.notices.map((n) => (
            <div key={n.id} className="flex items-center gap-3 border-b border-muted py-2.5 last:border-b-0">
              <MessageCircle className="size-[18px] shrink-0 text-green-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {NOTICE_LABEL[n.templateCode ?? ""] ?? n.templateCode ?? "Aviso"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {n.channel === "EMAIL" ? "Correo" : "WhatsApp"} · {formatDate(n.createdAt)}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {notificationStatusLabel(n.status)}
              </span>
            </div>
          ))
        ) : (
          <p className="py-3 text-center text-[13px] text-muted-foreground">
            Sin avisos en los últimos 6 meses
          </p>
        )}
      </MobileCard>
    </MobileScreen>
  );
}
