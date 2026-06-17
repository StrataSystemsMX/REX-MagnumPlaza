"use client";

import { UserButton } from "@clerk/nextjs";
import { History, Redo2, Search, Undo2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
export function Topbar({ canViewHistory = false }: { canViewHistory?: boolean }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground sm:px-6">
      {/* Izquierda — menú móvil + búsqueda (aún sin funcionalidad) */}
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar />
        {/* TODO: conectar búsqueda */}
        <InputGroup className="w-full max-w-xs bg-background sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput type="search" placeholder="Buscar…" aria-label="Buscar" />
        </InputGroup>
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

        {/* Historial de cambios — sólo visible para MASTER/ADMIN. */}
        {canViewHistory && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            render={<Link href="/historial" />}
          >
            <History className="size-4" />
            Historial de Cambios
          </Button>
        )}

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
