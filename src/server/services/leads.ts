"use server";

import { prisma, prismaUnsafe } from "@/server/prisma/client";
import { checkRateLimit, getClientIp } from "@/server/rate-limit";
import {
  getResendClient,
  getResendFromAddress,
} from "@/server/services/email/resend-client";
import { captureLeadSchema, type CaptureLeadInput } from "@/shared/validators/promoter";

// Anti-abuso de la captura pública: pocas capturas por IP en ventana corta,
// y un tope duro por link contra la DB (cross-instancia).
const IP_LIMIT = 5;
const IP_WINDOW_MS = 10 * 60 * 1000;
const LINK_HOURLY_CAP = 20;

/**
 * Captura pública de un interesado desde la página de la vacante ("Me interesa").
 *
 * Sin auth: el visitante es anónimo. Bootstrap legítimo con `prismaUnsafe` para
 * resolver el token → tenantId/linkId (no conocemos el tenant aún); el Lead se
 * crea con `prisma` pasando tenantId explícito. NUNCA se loguea el token.
 */
export async function actionCaptureLead(input: CaptureLeadInput): Promise<void> {
  const { token, name, phone, email, message, source } =
    captureLeadSchema.parse(input);

  const ip = await getClientIp();
  if (!checkRateLimit(`lead:${ip}`, IP_LIMIT, IP_WINDOW_MS)) {
    throw new Error("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
  }

  const link = await prismaUnsafe.promoterLink.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      tenantId: true,
      isActive: true,
      expiresAt: true,
      unit: { select: { code: true, property: { select: { name: true } } } },
      promoter: { select: { fullName: true } },
      tenant: { select: { name: true, officeEmail: true } },
    },
  });

  if (!link || !link.isActive || link.expiresAt.getTime() <= Date.now()) {
    throw new Error("Esta liga ya no está disponible.");
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Dedupe: mismo teléfono (o email) en el mismo link en la última hora →
  // aceptar en silencio sin crear otro Lead ni re-enviar el correo.
  const duplicate = await prisma.lead.findFirst({
    where: {
      tenantId: link.tenantId,
      promoterLinkId: link.id,
      createdAt: { gte: hourAgo },
      OR: [{ phone }, ...(email ? [{ email }] : [])],
    },
    select: { id: true },
  });
  if (duplicate) return;

  // Tope duro por link contra la DB (funciona aunque haya varias instancias).
  const recentCount = await prisma.lead.count({
    where: {
      tenantId: link.tenantId,
      promoterLinkId: link.id,
      createdAt: { gte: hourAgo },
    },
  });
  if (recentCount >= LINK_HOURLY_CAP) {
    throw new Error("No pudimos registrar tu interés en este momento. Intenta más tarde.");
  }

  await prisma.lead.create({
    data: {
      tenantId: link.tenantId,
      promoterLinkId: link.id,
      name,
      phone,
      email: email ?? null,
      message: message ?? null,
      source,
    },
  });

  // Aviso al admin (oficina) por correo — fire-and-forget: si falla, el lead ya
  // quedó guardado y no debe tirar la captura.
  try {
    const resend = getResendClient();
    const to = link.tenant.officeEmail;
    if (resend && to) {
      const unitLabel = `${link.unit.code} · ${link.unit.property.name}`;
      await resend.emails.send({
        from: getResendFromAddress(),
        to,
        subject: `Nuevo interesado en ${unitLabel}`,
        html: [
          `<h2>Nuevo interesado en una vacante</h2>`,
          `<p><strong>Local:</strong> ${escapeHtml(unitLabel)}</p>`,
          `<p><strong>Promotor:</strong> ${escapeHtml(link.promoter.fullName)}</p>`,
          `<p><strong>Canal:</strong> ${source === "PHYSICAL" ? "Lona / QR físico" : "Liga digital"}</p>`,
          `<hr/>`,
          `<p><strong>Nombre:</strong> ${escapeHtml(name)}</p>`,
          `<p><strong>Teléfono:</strong> ${escapeHtml(phone)}</p>`,
          email ? `<p><strong>Email:</strong> ${escapeHtml(email)}</p>` : "",
          message ? `<p><strong>Mensaje:</strong> ${escapeHtml(message)}</p>` : "",
        ].join("\n"),
      });
    }
  } catch (err) {
    console.error("[leads] admin notification failed", {
      linkId: link.id,
      err,
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
