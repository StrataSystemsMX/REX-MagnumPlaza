"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  actionUpdateTenantNotificationSettings,
  type TenantNotificationSettings,
} from "@/lib/services/notifications-actions";

interface Props {
  initial: TenantNotificationSettings;
}

export function NotificationSettingsForm({ initial }: Props) {
  const [overdue, setOverdue] = useState(initial.autoSendOverdueNotifications);
  const [payment, setPayment] = useState(initial.autoSendPaymentConfirmations);
  const [officeEmail, setOfficeEmail] = useState(initial.officeEmail ?? "");
  const [officeWhatsapp, setOfficeWhatsapp] = useState(initial.officeWhatsapp ?? "");
  const [pending, startTransition] = useTransition();

  const dirty =
    overdue !== initial.autoSendOverdueNotifications ||
    payment !== initial.autoSendPaymentConfirmations ||
    officeEmail !== (initial.officeEmail ?? "") ||
    officeWhatsapp !== (initial.officeWhatsapp ?? "");

  function save() {
    startTransition(async () => {
      try {
        await actionUpdateTenantNotificationSettings({
          autoSendOverdueNotifications: overdue,
          autoSendPaymentConfirmations: payment,
          officeEmail,
          officeWhatsapp,
        });
        toast.success("Configuración guardada.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {!initial.whatsappConfigured ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
          ⚠ WhatsApp no está configurado en este servidor (faltan{" "}
          <code className="font-mono">WHATSAPP_ACCESS_TOKEN</code> y{" "}
          <code className="font-mono">WHATSAPP_PHONE_NUMBER_ID</code>). Los
          envíos se simularán en consola y se marcarán como SENT igualmente.
        </div>
      ) : null}

      <SwitchRow
        title="Automatizar el aviso fuerte de 2 meses"
        description="Protocolo de 2 meses: al cumplir 2 meses de atraso se envía el aviso fuerte (detonante) automáticamente. Si está apagado, queda en PENDING y se manda manual. El recordatorio amable del 1er mes se activa por contrato; el de 3 meses siempre es manual."
        checked={overdue}
        onChange={setOverdue}
      />

      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
        <strong className="text-destructive">Aviso 3M (desalojo):</strong> nunca
        se envía automáticamente, sin importar este switch. Siempre requiere
        confirmación manual desde la página de morosidad.
      </div>

      <SwitchRow
        title="Confirmaciones de pago automáticas"
        description="Cuando se registra un Payment que cubre el total de una Rent, mandar la plantilla payment_received al inquilino."
        checked={payment}
        onChange={setPayment}
      />

      <div className="space-y-3 rounded-md border bg-card p-4">
        <div className="space-y-1">
          <p className="font-medium">Copia a la oficina (Eli)</p>
          <p className="text-xs text-muted-foreground">
            Cuando se envía un aviso de cobranza al inquilino, la oficina recibe
            una copia (con el PDF adjunto). Deja en blanco para no enviar copia.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Correo de la oficina</span>
            <input
              type="email"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="oficina@ejemplo.com"
              value={officeEmail}
              onChange={(e) => setOfficeEmail(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">
              WhatsApp de la oficina (E.164 sin +)
            </span>
            <input
              type="tel"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="5216621234567"
              value={officeWhatsapp}
              onChange={(e) => setOfficeWhatsapp(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={!dirty || pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Guardando...
            </>
          ) : (
            "Guardar cambios"
          )}
        </Button>
      </div>
    </div>
  );
}

function SwitchRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-4 transition-colors hover:bg-secondary/30">
      <input
        type="checkbox"
        className="mt-1 size-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}
