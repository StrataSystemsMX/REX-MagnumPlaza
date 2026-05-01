"use client";

import { MessageSquare, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { actionSendRentReminderManual } from "@/lib/services/notifications-actions";
import type { ReminderLevel } from "@/lib/pdf/template-config";

interface SendWhatsAppButtonProps {
  rentId: string;
  level: ReminderLevel;
  lesseeName: string;
  hasWhatsapp: boolean;
}

export function SendWhatsAppButton({
  rentId,
  level,
  lesseeName,
  hasWhatsapp,
}: SendWhatsAppButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      try {
        const result = await actionSendRentReminderManual(rentId, level);
        if (result.status === "SENT") {
          toast.success(
            `Aviso ${level} enviado a ${lesseeName} (${result.externalId?.slice(0, 16) ?? ""}…)`,
          );
        } else if (result.status === "FAILED") {
          toast.error(`Falló el envío: ${result.failureReason ?? "error desconocido"}`);
        } else {
          toast.warning(`Aviso registrado en PENDING (envío manual diferido).`);
        }
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al enviar.");
      }
    });
  }

  return (
    <>
      <Button
        variant={level === "3M" ? "destructive" : "secondary"}
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!hasWhatsapp}
        title={!hasWhatsapp ? "El inquilino no tiene WhatsApp registrado." : undefined}
      >
        <MessageSquare className="size-4" />
        WhatsApp
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {level === "3M"
                ? "Confirmar envío de notificación de desalojo"
                : `Enviar aviso ${level} por WhatsApp`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {level === "3M" ? (
                <>
                  Estás a punto de enviar la <strong>notificación formal de
                  desalojo</strong> a {lesseeName}. Política CRT: este aviso debe
                  estar autorizado por dirección y tener copia al abogado.
                  ¿Confirmas?
                </>
              ) : (
                <>
                  Se enviará el aviso {level} a {lesseeName} usando la plantilla
                  pre-aprobada de Meta. Se generará el PDF correspondiente y
                  quedará en la bitácora del inquilino.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                send();
              }}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Enviando...
                </>
              ) : (
                "Enviar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
