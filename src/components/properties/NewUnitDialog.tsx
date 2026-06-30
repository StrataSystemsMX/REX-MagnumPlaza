"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UnitForm } from "@/components/forms/UnitForm";

interface NewUnitDialogProps {
  propertyId: string;
  propertyName?: string;
  label?: string;
  size?: "default" | "sm" | "xs";
  variant?: "default" | "outline" | "secondary" | "ghost";
}

/**
 * Dialog para crear un local (Unit) dentro de una plaza/inmueble. Reutiliza
 * `UnitForm` en modo creación (sin `initial.id` → llama a actionCreateUnit).
 */
export function NewUnitDialog({
  propertyId,
  propertyName,
  label = "Crear local",
  size = "sm",
  variant = "outline",
}: NewUnitDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} size={size} className="gap-1.5" />}>
        <Plus className="size-4" />
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo local{propertyName ? ` · ${propertyName}` : ""}</DialogTitle>
          <DialogDescription>
            Captura los datos del local. Podrás editarlo o agruparlo después.
          </DialogDescription>
        </DialogHeader>
        <UnitForm
          initial={{ propertyId, code: "", status: "DISPONIBLE" }}
          submitLabel="Crear local"
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
