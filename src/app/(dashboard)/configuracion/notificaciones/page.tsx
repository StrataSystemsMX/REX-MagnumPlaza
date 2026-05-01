import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { NotificationSettingsForm } from "@/components/configuracion/NotificationSettingsForm";
import { requireAuth } from "@/lib/auth/get-session";
import { isMaster } from "@/lib/auth/permissions";
import { actionGetTenantNotificationSettings } from "@/lib/services/notifications-actions";

export default async function ConfiguracionNotificacionesPage() {
  const { dbUser } = await requireAuth();
  const master = await isMaster(dbUser.id);
  if (!master) {
    notFound();
  }

  const settings = await actionGetTenantNotificationSettings();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/configuracion"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a Configuración
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Notificaciones
          </h1>
          <Badge variant="secondary">MASTER</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Define cuándo el sistema manda WhatsApp automáticamente y cuándo deja
          la notificación en cola para envío manual.
        </p>
      </div>

      <NotificationSettingsForm initial={settings} />
    </div>
  );
}
