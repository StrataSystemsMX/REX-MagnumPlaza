import { VacancyLeadButton } from "@/components/promoters/public/VacancyLeadButton";
import { buildWhatsAppUrl } from "@/lib/utils/whatsapp-link";
import { formatMXN } from "@/lib/format-currency";

interface Props {
  token: string;
  source: "DIGITAL" | "PHYSICAL";
  contactPhone: string | null;
  tenantName: string;
  promoterFullName: string;
  unitCode: string;
  propertyName: string;
  estimatedRent: number | null;
}

export function VacancyContactCTA({
  token,
  source,
  contactPhone,
  tenantName,
  promoterFullName,
  unitCode,
  propertyName,
  estimatedRent,
}: Props) {
  if (!contactPhone) return null;

  const message = `Hola ${tenantName}, vi el local ${unitCode} de ${propertyName} a través del link de ${promoterFullName} y me interesa. ¿Podríamos agendar una visita?`;
  const url = buildWhatsAppUrl(contactPhone, message);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Renta mensual</p>
          <p className="truncate text-base font-semibold">
            {estimatedRent != null ? formatMXN(estimatedRent) : "Consultar"}
          </p>
        </div>
        <div className="shrink-0">
          <VacancyLeadButton
            token={token}
            whatsappUrl={url}
            label="Me interesa"
            source={source}
          />
        </div>
      </div>
    </div>
  );
}
