import { FileQuestion } from "lucide-react";
import { PublicFooter } from "@/components/promoters/public/PublicFooter";

export default function NotFound() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
      <section className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <FileQuestion className="size-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Link no encontrado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Verifica que el enlace esté completo. Si el problema persiste, contacta al promotor que te lo envió.
        </p>
      </section>
      <PublicFooter />
    </article>
  );
}
