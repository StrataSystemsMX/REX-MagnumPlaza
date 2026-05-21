import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getUnitByPromoterToken,
  trackVacancyVisit,
} from "@/lib/services/promoters-public";
import { PublicFooter } from "@/components/promoters/public/PublicFooter";
import { VacancyContactCTA } from "@/components/promoters/public/VacancyContactCTA";
import { VacancyDetails } from "@/components/promoters/public/VacancyDetails";
import { VacancyGallery } from "@/components/promoters/public/VacancyGallery";
import { VacancyHero } from "@/components/promoters/public/VacancyHero";
import { VacancyMap } from "@/components/promoters/public/VacancyMap";
import { VacancyPriceCard } from "@/components/promoters/public/VacancyPriceCard";
import { VacancyTerms } from "@/components/promoters/public/VacancyTerms";
import { VacancyUnavailable } from "@/components/promoters/public/VacancyUnavailable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const result = await getUnitByPromoterToken(token);
  if (result.kind !== "ok") {
    return {
      title: "Link no disponible · Rex",
      robots: { index: false, follow: false },
    };
  }
  const { unit, property, unitPhotos } = result.data;
  const cover = unitPhotos[0]?.url;
  return {
    title: `${unit.code} · ${property.name} · Rex`,
    description: `Local disponible en ${property.address}`,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${property.name} — ${unit.code}`,
      description: `Local disponible en ${property.address}`,
      images: cover ? [{ url: cover }] : [],
    },
  };
}

export default async function PublicVacancyPage({ params }: PageProps) {
  const { token } = await params;
  const result = await getUnitByPromoterToken(token);

  if (result.kind === "not_found") notFound();
  if (result.kind === "deactivated") return <VacancyUnavailable reason="deactivated" />;
  if (result.kind === "expired") return <VacancyUnavailable reason="expired" />;
  if (result.kind === "rented") return <VacancyUnavailable reason="rented" />;

  const { data, tracking } = result;
  void trackVacancyVisit(tracking.linkId, tracking.tenantId);

  const cover = data.unitPhotos[0]?.url ?? data.propertyPhotos[0]?.url ?? null;
  const remainingPhotos = data.unitPhotos.slice(1).concat(data.propertyPhotos);

  return (
    <>
      <article className="mx-auto max-w-6xl pb-32 lg:pb-12">
        <VacancyHero
          unit={data.unit}
          property={data.property}
          tenant={data.tenant}
          coverUrl={cover}
        />

        <div className="mt-6 grid gap-6 lg:mt-10 lg:grid-cols-3 lg:gap-10">
          <div className="space-y-8 lg:order-1 lg:col-span-2">
            <VacancyDetails unit={data.unit} property={data.property} />
            <VacancyTerms unit={data.unit} />
            <VacancyGallery photos={remainingPhotos} />
            <VacancyMap
              lat={data.property.latitude}
              lng={data.property.longitude}
              address={data.property.address}
            />
          </div>

          <aside className="lg:order-2 lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <VacancyPriceCard
                estimatedRent={data.unit.estimatedRent}
                area={data.unit.area ?? data.property.totalArea}
                status={data.unit.status}
                promoter={data.promoter}
                contactPhone={data.tenant.contactPhone}
                tenantName={data.tenant.name}
                unitCode={data.unit.code}
                propertyName={data.property.name}
              />
            </div>
          </aside>
        </div>

        <PublicFooter />
      </article>

      <VacancyContactCTA
        contactPhone={data.tenant.contactPhone}
        tenantName={data.tenant.name}
        promoterFullName={data.promoter.fullName}
        unitCode={data.unit.code}
        propertyName={data.property.name}
        estimatedRent={data.unit.estimatedRent}
      />
    </>
  );
}
