"use client";

import { UserButton } from "@clerk/nextjs";
import { History, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileSidebar } from "./mobile-sidebar";

/**
 * Barra superior global. Vive fuera del contenedor con scroll del layout
 * (`<main>`), así que permanece fija arriba al hacer scroll y se muestra en
 * todas las ventanas del dashboard.
 *
 * Izquierda y centro se dejan vacíos a propósito (reservados para cambios
 * posteriores). En la izquierda solo aparece el disparador del menú en móvil
 * (`lg:hidden`), necesario para navegar cuando el sidebar está oculto.
 */
export function Topbar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card px-4 sm:px-6">
      {/* Izquierda — reservada (solo menú móvil) */}
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar />
      </div>

      {/* Centro — reservado para cambios posteriores */}

      {/* Derecha — sesión e historial */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* TODO: conectar deshacer */}
        <Button variant="ghost" size="icon" aria-label="Deshacer cambios">
          <Undo2 className="size-4" />
        </Button>
        {/* TODO: conectar rehacer */}
        <Button variant="ghost" size="icon" aria-label="Rehacer cambios">
          <Redo2 className="size-4" />
        </Button>

        {/* TODO: conectar historial de cambios */}
        <Button variant="ghost" size="sm" className="gap-1.5">
          <History className="size-4" />
          Historial de Cambios
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        {/* Sesión activa */}
        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
      </div>
    </header>
  );
}
