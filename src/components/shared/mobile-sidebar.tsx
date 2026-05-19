"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarContent } from "./sidebar-content";

export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label="Abrir menú"
            className="inline-flex size-9 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground lg:hidden"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-72 flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground sm:max-w-xs"
        showCloseButton={false}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navegación</SheetTitle>
          <SheetDescription>Menú principal de Rex</SheetDescription>
        </SheetHeader>
        <SidebarContent onLinkClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
