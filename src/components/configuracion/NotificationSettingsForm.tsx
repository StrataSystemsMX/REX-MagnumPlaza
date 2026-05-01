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
  const [pending, startTransition] = useTransition();

  const dirty =
    overdue !== initial.autoSendOverdueNotifications ||
    payment !== initial.autoSendPaymentConfirmations;

  function save() {
    startTransition(async () => {
      try {
        await actionUpdateTenantNotificationSettings({
          autoSendOverdueNotifications: overdue,
          autoSendPaymentConfirmations: payment,
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
        title="Avisos de morosidad automáticos (1M y 2M)"
        description="Cuando un Rent transicione a OVERDUE_1M u OVERDUE_2M se envía la plantilla por WhatsApp inmediatamente. Si está apagado, el sistema deja el aviso en PENDING y un humano lo manda manualmente."
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
