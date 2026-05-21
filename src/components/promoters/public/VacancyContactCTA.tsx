import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWhatsAppUrl } from "@/lib/utils/whatsapp-link";

interface Props {
  contactPhone: string | null;
  tenantName: string;
  promoterFullName: string;
  unitCode: string;
  propertyName: string;
  estimatedRent: number | null;
}

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export function VacancyContactCTA({
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
            {estimatedRent != null ? MXN.format(estimatedRent) : "Consultar"}
          </p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <Button size="lg" className="bg-green-600 hover:bg-green-700">
            <MessageCircle className="size-4" />
            WhatsApp
          </Button>
        </a>
      </div>
    </div>
  );
}
