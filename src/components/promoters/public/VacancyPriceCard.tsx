import { UserCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { unitStatusLabel, unitStatusVariant } from "@/lib/i18n/enums";
import type { PublicVacancyData } from "@/lib/services/promoters-public";
import { buildWhatsAppUrl } from "@/lib/utils/whatsapp-link";
import { VacancyLeadButton } from "@/components/promoters/public/VacancyLeadButton";
import { Badge } from "@/components/ui/badge";
import { formatMXN } from "@/lib/format-currency";

interface Props {
  token: string;
  estimatedRent: number | null;
  area: number | null;
  status: PublicVacancyData["unit"]["status"];
  promoter: PublicVacancyData["promoter"];
  contactPhone: string | null;
  tenantName: string;
  unitCode: string;
  propertyName: string;
}

export function VacancyPriceCard({
  token,
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
          {estimatedRent != null ? formatMXN(estimatedRent) : "Consultar"}
        </p>
        {pricePerM2 != null ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {formatMXN(pricePerM2)} / m²
          </p>
        ) : null}
      </div>

      {whatsappUrl ? (
        <>
          <Separator className="my-5" />
          <VacancyLeadButton
            token={token}
            whatsappUrl={whatsappUrl}
            label="Me interesa"
            className="w-full bg-green-600 hover:bg-green-700"
          />
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
