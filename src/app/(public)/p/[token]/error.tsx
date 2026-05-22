"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PublicVacancyError({ reset }: { error: Error; reset: () => void }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
      <section className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <AlertTriangle className="size-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          No pudimos cargar la información del local. Intenta de nuevo en unos momentos.
        </p>
        <Button onClick={reset} variant="outline" size="sm">
          Reintentar
        </Button>
      </section>
    </article>
  );
}
