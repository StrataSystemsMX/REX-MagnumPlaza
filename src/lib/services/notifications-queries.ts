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

/** Notificaciones asociadas a un Rent: filtramos por templateCode + lessee. */
export async function getNotificationLogsForRent(rentId: string) {
  const { tenantId } = await requireAuth();
  const rent = await prisma.rent.findFirst({
    where: { id: rentId, tenantId },
    select: { contract: { select: { lesseeId: true } }, period: true },
  });
  if (!rent) return [];

  return prisma.notificationLog.findMany({
    where: {
      tenantId,
      recipientType: "LESSEE",
      recipientId: rent.contract.lesseeId,
      templateCode: {
        in: ["RENT_REMINDER_1M", "RENT_REMINDER_2M", "RENT_REMINDER_3M_LEGAL"],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
