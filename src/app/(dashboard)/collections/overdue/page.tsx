import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { OverdueLevelSection } from "@/components/collections/OverdueLevelSection";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { getOutstandingRents } from "@/lib/services/payments-queries";

export default async function OverdueCollectionsPage() {
  const { tenantId } = await requireAuth();

  const [overdue1m, overdue2m, overdue3m] = await Promise.all([
    getOutstandingRents({ statuses: ["OVERDUE_1M"] }),
    getOutstandingRents({ statuses: ["OVERDUE_2M"] }),
    getOutstandingRents({ statuses: ["OVERDUE_3M"] }),
  ]);

  // Mapa rentId → último contacto. NotificationLog asocia por recipientId
  // (lesseeId), no por rentId; igual lo dejamos preparado para cuando se
  // empiece a poblar — ahora mismo siempre estará vacío.
  const allLesseeIds = new Set<string>();
  for (const r of [...overdue1m, ...overdue2m, ...overdue3m]) {
    allLesseeIds.add(r.contract.lessee.id);
  }
  const notifs =
    allLesseeIds.size > 0
      ? await prisma.notificationLog.findMany({
          where: {
            tenantId,
            recipientType: "LESSEE",
            recipientId: { in: Array.from(allLesseeIds) },
            sentAt: { not: null },
          },
          orderBy: { sentAt: "desc" },
        })
      : [];

  // Tomamos la última notificación por inquilino y la asignamos a todos sus rents.
  const lastByLessee = new Map<string, { sentAt: Date; channel: string }>();
  for (const n of notifs) {
    if (!n.sentAt) continue;
    if (!lastByLessee.has(n.recipientId)) {
      lastByLessee.set(n.recipientId, { sentAt: n.sentAt, channel: n.channel });
    }
  }
  function buildLastContact(rents: typeof overdue1m): Record<string, { sentAt: Date; channel: string }> {
    const out: Record<string, { sentAt: Date; channel: string }> = {};
    for (const r of rents) {
      const lc = lastByLessee.get(r.contract.lessee.id);
      if (lc) out[r.id] = lc;
    }
    return out;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/collections"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a Cobranza
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Morosidad</h1>
        <p className="text-sm text-muted-foreground">
          Casos de morosidad escalonada según política CRT: aviso amistoso,
          aviso formal, inicio de desalojo. Se mueven automáticamente cada día
          a las 08:00 hora de Hermosillo.
        </p>
      </div>

      <OverdueLevelSection
        level={1}
        rents={overdue1m}
        lastContactByRent={buildLastContact(overdue1m)}
      />
      <OverdueLevelSection
        level={2}
        rents={overdue2m}
        lastContactByRent={buildLastContact(overdue2m)}
      />
      <OverdueLevelSection
        level={3}
        rents={overdue3m}
        lastContactByRent={buildLastContact(overdue3m)}
      />
    </div>
  );
}
