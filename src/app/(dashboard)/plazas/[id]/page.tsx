import { notFound, redirect } from "next/navigation";
import { MobilePlazaDetail } from "@/components/mobile/MobileProperties";
import { currentPeriodStart } from "@/shared/mobile/format";
import { backTarget } from "@/shared/mobile/nav";
import { getIsMobileView } from "@/server/mobile/viewport";
import { getMonthlyCollectionsByProperty } from "@/server/services/payments-queries";

/**
 * Detalle de plaza (solo Rex móvil). En escritorio el detalle de un inmueble
 * es su reporte, así que redirigimos ahí.
 */
export default async function PlazaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  if (!(await getIsMobileView())) redirect(`/reportes/inmueble/${id}`);

  const monthly = await getMonthlyCollectionsByProperty(currentPeriodStart());
  const property = monthly.properties.find((p) => p.propertyId === id);
  if (!property) notFound();

  return (
    <MobilePlazaDetail
      property={property}
      back={backTarget(from, { href: "/plazas", label: "Propiedades" })}
    />
  );
}
