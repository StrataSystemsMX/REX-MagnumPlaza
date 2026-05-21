import { MapPin, Navigation } from "lucide-react";

interface Props {
  lat: number | null;
  lng: number | null;
  address: string;
}

export function VacancyMap({ lat, lng, address }: Props) {
  const apiKey = process.env["NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"];

  if (lat == null || lng == null || !apiKey) {
    return (
      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">Ubicación</h2>
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
          <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-sm text-muted-foreground">{address}</span>
        </div>
      </section>
    );
  }

  const embedSrc = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${lat},${lng}&zoom=16`;
  const dirHref = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">Ubicación</h2>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <iframe
          src={embedSrc}
          title={`Mapa de ${address}`}
          className="h-72 w-full border-0 sm:h-96"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-balance">{address}</span>
          </p>
          <a
            href={dirHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 sm:self-auto"
          >
            <Navigation className="size-3.5" />
            Cómo llegar
          </a>
        </div>
      </div>
    </section>
  );
}
