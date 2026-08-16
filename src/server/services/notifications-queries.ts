import { requireAuth } from "@/server/auth/get-session";
import { prisma } from "@/server/prisma/client";

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
