import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

/** Bitácora de notificaciones de un inquilino, ordenada de más reciente a más vieja. */
export async function getNotificationLogsByLessee(lesseeId: string) {
  const { tenantId } = await requireAuth();
  return prisma.notificationLog.findMany({
    where: {
      tenantId,
      recipientType: "LESSEE",
      recipientId: lesseeId,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export type NotificationLogRow = Awaited<
  ReturnType<typeof getNotificationLogsByLessee>
>[number];
