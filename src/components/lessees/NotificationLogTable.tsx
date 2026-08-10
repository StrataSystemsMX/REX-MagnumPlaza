"use client";

import { RotateCw, ExternalLink, Loader2, Send } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  notificationStatusLabel,
  communicationChannelLabel,
} from "@/shared/i18n/enums";
import { actionRetryNotification } from "@/server/services/notifications-actions";
import type { NotificationLogRow } from "@/server/services/notifications-queries";
import type { NotificationStatus } from "@/generated/prisma/enums";
import { capitalizeFirst } from "@/shared/utils";

const DATETIME = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

function statusVariant(s: NotificationStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "DELIVERED":
    case "READ":
      return "default";
    case "SENT":
      return "secondary";
    case "PENDING":
      return "outline";
    case "FAILED":
    case "BOUNCED":
      return "destructive";
    default:
      return "secondary";
  }
}

function templateLabel(code: string | null): string {
  switch (code) {
    case "RENT_REMINDER_1M":
      return "Aviso 1M (amistoso)";
    case "RENT_REMINDER_2M":
      return "Aviso 2M (formal)";
    case "RENT_REMINDER_3M_LEGAL":
      return "Aviso 3M (desalojo)";
    case "PAYMENT_RECEIVED":
      return "Confirmación de pago";
    case "CONTRACT_EXPIRING":
      return "Contrato por vencer";
    case "EVICTION_INITIATION":
      return "Inicio de desalojo";
    default:
      return code ?? "—";
  }
}

interface NotificationLogTableProps {
  logs: ReadonlyArray<NotificationLogRow>;
}

export function NotificationLogTable({ logs }: NotificationLogTableProps) {
  const [pending, startTransition] = useTransition();

  function send(id: string, isRetry: boolean) {
    startTransition(async () => {
      try {
        const r = await actionRetryNotification(id);
        if (r.status === "SENT") {
          toast.success(isRetry ? "Reenviado correctamente." : "Enviado correctamente.");
        } else if (r.status === "FAILED") {
          toast.error(
            `${isRetry ? "Reintento" : "Envío"} falló: ${r.failureReason ?? "error desconocido"}`,
          );
        } else {
          toast.warning("Quedó en PENDING.");
        }
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : isRetry ? "Error al reintentar." : "Error al enviar.",
        );
      }
    });
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        Sin notificaciones registradas todavía.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead className="text-center">Fecha</TableHead>
            <TableHead>Plantilla</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead>Detalle</TableHead>
            <TableHead className="text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((l) => {
            const pdfMatch = /https?:\/\/\S+\.pdf|\/generated-pdfs\/\S+\.pdf/.exec(l.body);
            const pdfUrl = pdfMatch?.[0] ?? null;
            return (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-center text-xs tabular-nums">
                  {capitalizeFirst(DATETIME.format(l.createdAt))}
                </TableCell>
                <TableCell className="text-sm">
                  {templateLabel(l.templateCode)}
                </TableCell>
                <TableCell className="text-xs">
                  {communicationChannelLabel(l.channel)}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={statusVariant(l.status)}>
                    {notificationStatusLabel(l.status)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[28rem] text-xs text-muted-foreground">
                  <div className="space-y-1">
                    <p className="line-clamp-2">{l.body}</p>
                    {l.failureReason ? (
                      <p className="text-destructive">⚠ {l.failureReason}</p>
                    ) : null}
                    {l.externalId ? (
                      <p className="font-mono text-[10px] text-muted-foreground/70">
                        ID: {l.externalId.slice(0, 24)}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {pdfUrl ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
                        title="Ver PDF"
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                    ) : null}
                    {l.status === "PENDING" ? (
                      <Button
                        size="sm"
                        variant="default"
                        disabled={pending}
                        onClick={() => send(l.id, false)}
                      >
                        {pending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                        Enviar
                      </Button>
                    ) : l.status === "FAILED" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => send(l.id, true)}
                      >
                        {pending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RotateCw className="size-4" />
                        )}
                        Reintentar
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
