import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { RunMorosityCronButton } from "@/components/configuracion/RunMorosityCronButton";
import { requireAuth } from "@/server/auth/get-session";
import { isMaster } from "@/server/auth/permissions";
import { prisma } from "@/server/prisma/client";
import { capitalizeFirst } from "@/shared/utils";
import { formatMXN } from "@/shared/format-currency";

const DATETIME = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ConfiguracionSistemaPage() {
  const { tenantId, dbUser } = await requireAuth();
  const master = await isMaster(dbUser.id);
  if (!master) {
    // No exponer la existencia de la página a no-MASTER.
    notFound();
  }

  const [latestSnapshots, lastOverdueAudits] = await Promise.all([
    prisma.morosityDailySnapshot.findMany({
      where: { tenantId },
      orderBy: { date: "desc" },
      take: 7,
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: "Rent",
        action: "UPDATE",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

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
          <h1 className="text-2xl font-semibold tracking-tight">Sistema</h1>
          <Badge variant="secondary">MASTER</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Acciones técnicas del tenant: cron de morosidad, snapshots, auditoría
          de transiciones automáticas.
        </p>
      </div>

      <div className="space-y-4 rounded-md border bg-card p-6">
        <div>
          <h2 className="font-medium">Cron diario de morosidad</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            En producción se ejecuta automáticamente a las 08:00 hora de
            Hermosillo (16:00 UTC). Aquí puedes dispararlo a mano para tu
            tenant — útil después de capturar pagos en lote o si quieres
            forzar un snapshot extra.
          </p>
        </div>
        <RunMorosityCronButton />
      </div>

      <div className="space-y-3 rounded-md border bg-card p-6">
        <h2 className="font-medium">Snapshots recientes (últimos 7 días)</h2>
        {latestSnapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay snapshots. Corre el cron una vez para generar el primero.
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-3">Fecha</th>
                  <th className="py-1 pr-3 text-right">Total cargado</th>
                  <th className="py-1 pr-3 text-right">Saldo vencido</th>
                  <th className="py-1 pr-3">Distribución por estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {latestSnapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5 pr-3 font-mono text-xs">
                      {s.date.toISOString().slice(0, 10)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {formatMXN(Number(s.totalAmount))}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-destructive">
                      {formatMXN(Number(s.overdueAmount))}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-[10px]">
                      {JSON.stringify(s.byStatus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-md border bg-card p-6">
        <h2 className="font-medium">Últimas transiciones automáticas</h2>
        {lastOverdueAudits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            El cron aún no ha registrado transiciones a OVERDUE.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {lastOverdueAudits.map((a) => (
              <li key={a.id} className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  {capitalizeFirst(DATETIME.format(a.createdAt))} · Rent {a.entityId.slice(-8)}
                </p>
                <p className="mt-0.5 font-mono text-[10px]">
                  {JSON.stringify(a.changes)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
