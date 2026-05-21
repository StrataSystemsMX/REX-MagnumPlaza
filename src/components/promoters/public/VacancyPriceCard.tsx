import { MessageCircle, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { unitStatusLabel, unitStatusVariant } from "@/lib/i18n/enums";
import type { PublicVacancyData } from "@/lib/services/promoters-public";
import { buildWhatsAppUrl } from "@/lib/utils/whatsapp-link";
import { Badge } from "@/components/ui/badge";

interface Props {
  estimatedRent: number | null;
  area: number | null;
  status: PublicVacancyData["unit"]["status"];
  promoter: PublicVacancyData["promoter"];
  contactPhone: string | null;
  tenantName: string;
  unitCode: string;
  propertyName: string;
}

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export function VacancyPriceCard({
  estimatedRent,
  area,
  status,
  promoter,
  contactPhone,
  tenantName,
  unitCode,
  propertyName,
}: Props) {
  const pricePerM2 =
    estimatedRent != null && area != null && area > 0
      ? Math.round(estimatedRent / area)
      : null;

  const message = `Hola ${tenantName}, vi el local ${unitCode} de ${propertyName} a través del link de ${promoter.fullName} y me interesa. ¿Podríamos agendar una visita?`;
  const whatsappUrl = contactPhone ? buildWhatsAppUrl(contactPhone, message) : null;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Renta mensual
          </p>
          <Badge variant={unitStatusVariant(status)}>{unitStatusLabel(status)}</Badge>
        </div>
        <p className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {estimatedRent != null ? MXN.format(estimatedRent) : "Consultar"}
        </p>
        {pricePerM2 != null ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {MXN.format(pricePerM2)} / m²
          </p>
        ) : null}
      </div>

      {whatsappUrl ? (
        <>
          <Separator className="my-5" />
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="w-full bg-green-600 hover:bg-green-700">
              <MessageCircle className="size-5" />
              Contactar por WhatsApp
            </Button>
          </a>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Respuesta directa con la administración
          </p>
        </>
      ) : null}

      <Separator className="my-5" />

      <div className="flex items-start gap-3">
        <UserCircle2 className="size-9 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Promueve
          </p>
          <p className="mt-0.5 truncate text-sm font-medium">{promoter.fullName}</p>
          {promoter.agency ? (
            <p className="truncate text-xs text-muted-foreground">{promoter.agency}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
