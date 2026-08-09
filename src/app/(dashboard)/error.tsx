"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary del dashboard. Antes no existía: cualquier throw en un
 * Server Component (incluida una PermissionError) caía al boundary crudo de
 * Next. El mensaje real solo llega en dev; en prod Next lo redacta y deja
 * `digest` para correlacionar con los logs del servidor.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] error boundary", error);
  }, [error]);

  const isPermission = error.message.includes("Permiso requerido");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-2">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          {isPermission ? "No tienes permiso para ver esto" : "Algo salió mal"}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {isPermission
            ? "Tu rol no tiene acceso a esta sección. Si crees que es un error, contacta al administrador."
            : "Ocurrió un error inesperado al cargar esta página. Intenta de nuevo; si persiste, avisa al equipo."}
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground/70">Código: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => reset()}>
          Reintentar
        </Button>
        <Button onClick={() => (window.location.href = "/")}>Ir al inicio</Button>
      </div>
    </div>
  );
}
