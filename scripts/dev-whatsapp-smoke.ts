/**
 * Smoke test del módulo de notificaciones WhatsApp.
 *
 * Uso: pnpm tsx --env-file=.env.local scripts/dev-whatsapp-smoke.ts
 *
 * Busca un Rent en estado OVERDUE_x/DUE/PARTIAL cuyo Lessee tenga WhatsApp
 * registrado y dispara sendRentReminder con forceSend=true. Verifica que se
 * cree el NotificationLog y reporta el resultado.
 */
import { prismaUnsafe } from "../src/lib/prisma/client";
import { sendRentReminder } from "../src/lib/services/notifications";
import { isWhatsAppConfigured } from "../src/lib/whatsapp/client";

async function main(): Promise<void> {
  console.log(
    `WhatsApp configurado: ${isWhatsAppConfigured() ? "sí (real)" : "no (modo simulado)"}`,
  );

  const tenant = await prismaUnsafe.tenant.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, autoSendOverdueNotifications: true },
  });
  if (!tenant) {
    throw new Error("No hay tenants activos. Corre `pnpm db:seed` primero.");
  }
  console.log(
    `Tenant: ${tenant.name} (autoSend=${tenant.autoSendOverdueNotifications})`,
  );

  // Preferimos un Rent cuyo Lessee tenga WhatsApp registrado para probar el
  // path completo (simulación + log SENT). Si no hay, caemos a cualquiera y
  // veremos el path de FAILED con razón clara.
  const withWhatsapp = await prismaUnsafe.rent.findFirst({
    where: {
      tenantId: tenant.id,
      status: { in: ["OVERDUE_1M", "OVERDUE_2M", "DUE", "PARTIAL"] },
      contract: { lessee: { whatsapp: { not: null } } },
    },
    include: {
      contract: {
        include: { lessee: { select: { legalName: true, whatsapp: true } } },
      },
    },
  });
  const fallback = withWhatsapp
    ? null
    : await prismaUnsafe.rent.findFirst({
        where: {
          tenantId: tenant.id,
          status: { in: ["OVERDUE_1M", "OVERDUE_2M", "DUE", "PARTIAL"] },
        },
        include: {
          contract: {
            include: {
              lessee: { select: { legalName: true, whatsapp: true } },
            },
          },
        },
      });
  const candidate = withWhatsapp ?? fallback;
  if (!candidate) {
    throw new Error(
      "No hay Rents en estado OVERDUE_*/DUE/PARTIAL. Ajusta fechas en seed o corre el cron primero.",
    );
  }

  console.log(
    `Rent ${candidate.id.slice(-8)} · ${candidate.contract.lessee.legalName} · status=${candidate.status} · whatsapp=${candidate.contract.lessee.whatsapp ?? "(ninguno)"}`,
  );

  const result = await sendRentReminder(tenant.id, candidate.id, "1M", {
    forceSend: true,
  });
  console.log("Resultado:", result);

  const log = await prismaUnsafe.notificationLog.findFirst({
    where: { id: result.notificationLogId },
  });
  console.log("NotificationLog creado:", {
    id: log?.id,
    status: log?.status,
    templateCode: log?.templateCode,
    externalId: log?.externalId,
    failureReason: log?.failureReason,
    body: log?.body.slice(0, 100),
  });
}

main()
  .catch((e) => {
    console.error("Smoke test falló:", e);
    process.exit(1);
  })
  .finally(() => setTimeout(() => process.exit(0), 100));
