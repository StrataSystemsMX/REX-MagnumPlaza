"use client";

import { Loader2, MessageSquare } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionSendRentReminderManual } from "@/lib/services/notifications-actions";
import type { ReminderLevel } from "@/lib/pdf/template-config";

type Channel = "WHATSAPP" | "EMAIL";

const CHANNEL_LABELS: Record<Channel, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Correo electrónico",
};

interface SendNotificationDialogProps {
  rentId: string;
  level: ReminderLevel;
  lessee: {
    legalName: string;
    whatsapp: string | null;
    email: string | null;
    preferredChannel: string;
  };
}

export function SendNotificationDialog({
  rentId,
  level,
  lessee,
}: SendNotificationDialogProps) {
  const initialChannel: Channel =
    lessee.preferredChannel === "EMAIL" ? "EMAIL" : "WHATSAPP";

  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const [destination, setDestination] = useState<string>(
    initialChannel === "EMAIL" ? (lessee.email ?? "") : (lessee.whatsapp ?? ""),
  );
  const [pending, startTransition] = useTransition();

  function handleChannelChange(next: Channel) {
    setChannel(next);
    setDestination(next === "EMAIL" ? (lessee.email ?? "") : (lessee.whatsapp ?? ""));
  }

  function reset() {
    setChannel(initialChannel);
    setDestination(
      initialChannel === "EMAIL" ? (lessee.email ?? "") : (lessee.whatsapp ?? ""),
    );
  }

  function send() {
    if (!destination.trim()) {
      toast.error(
        channel === "EMAIL"
          ? "Captura un correo destino."
          : "Captura un número de WhatsApp.",
      );
      return;
    }
    startTransition(async () => {
      try {
        const result = await actionSendRentReminderManual(rentId, level, {
          channel,
          to: destination.trim(),
        });
        if (channel === "WHATSAPP") {
          if (result.waUrl) {
            window.open(result.waUrl, "_blank", "noopener,noreferrer");
            toast.success("Mensaje listo en WhatsApp. Confírmalo desde la app.");
            setOpen(false);
            reset();
            return;
          }
          toast.error("No se pudo construir el link de WhatsApp.");
          return;
        }
        if (result.status === "SENT") {
          toast.success(`Correo enviado a ${destination}.`);
          setOpen(false);
          reset();
        } else {
          toast.error(`Falló el envío: ${result.failureReason ?? "error desconocido"}`);
        }
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
      >
        <MessageSquare className="size-4" />
        Enviar recordatorio
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!pending) {
            setOpen(v);
            if (!v) reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {level === "3M"
                ? "Confirmar envío de notificación de desalojo"
                : `Enviar aviso ${level}`}
            </DialogTitle>
            <DialogDescription>
              {level === "3M" ? (
                <>
                  Estás a punto de enviar la{" "}
                  <strong>notificación formal de desalojo</strong> a{" "}
                  {lessee.legalName}. Política CRT: este aviso debe estar
                  autorizado por dirección y tener copia al abogado.
                </>
              ) : (
                <>
                  Se generará el PDF del aviso {level} y se enviará a{" "}
                  {lessee.legalName}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="channel">Canal</Label>
              <Select
                value={channel}
                onValueChange={(v) => handleChannelChange(v as Channel)}
                items={CHANNEL_LABELS}
                disabled={pending}
              >
                <SelectTrigger id="channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="EMAIL">Correo electrónico</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Default: canal preferido del inquilino (
                {lessee.preferredChannel === "EMAIL" ? "Correo" : "WhatsApp"}).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="destination">
                {channel === "EMAIL" ? "Correo electrónico" : "Número WhatsApp"}
              </Label>
              <Input
                id="destination"
                type={channel === "EMAIL" ? "email" : "tel"}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={
                  channel === "EMAIL"
                    ? "destinatario@correo.com"
                    : "+52 1234567890"
                }
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                {channel === "EMAIL"
                  ? "Puedes editarlo para enviar a un correo de prueba."
                  : "Se abrirá WhatsApp Web/app con la plantilla pre-llenada."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={send} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Enviando...
                </>
              ) : channel === "WHATSAPP" ? (
                "Abrir WhatsApp"
              ) : (
                "Enviar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
