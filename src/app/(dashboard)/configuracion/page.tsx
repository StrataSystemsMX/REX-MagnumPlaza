import { MessageSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";

const SECTIONS = [
  {
    href: "/configuracion/sistema",
    title: "Sistema",
    description:
      "Cron de morosidad, snapshots, configuración técnica del tenant.",
    icon: ShieldCheck,
  },
  {
    href: "/configuracion/notificaciones",
    title: "Notificaciones",
    description:
      "Avisos automáticos por WhatsApp (morosidad, confirmaciones de pago).",
    icon: MessageSquare,
  },
];

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Ajustes del tenant. Algunas secciones requieren rol MASTER.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex gap-3 rounded-md border bg-card p-4 transition-colors hover:bg-secondary/40"
            >
              <Icon className="size-5 shrink-0" />
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

