import { AlertCircle } from "lucide-react";
import { PublicFooter } from "./PublicFooter";

type Reason = "expired" | "deactivated" | "rented";

interface Props {
  reason: Reason;
}

const COPY: Record<Reason, { title: string; body: string }> = {
  expired: {
    title: "Este link ya expiró",
    body: "El periodo de promoción terminó. Contacta al promotor para obtener un link actualizado.",
  },
  deactivated: {
    title: "Este link no está activo",
    body: "El enlace fue desactivado por la inmobiliaria. Contacta al promotor para más información.",
  },
  rented: {
    title: "Este local ya no está disponible",
    body: "El local fue rentado o está fuera de promoción. Pregunta al promotor por otras opciones.",
  },
};

export function VacancyUnavailable({ reason }: Props) {
  const { title, body } = COPY[reason];
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
      <section className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <AlertCircle className="size-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      </section>
      <PublicFooter />
    </article>
  );
}
