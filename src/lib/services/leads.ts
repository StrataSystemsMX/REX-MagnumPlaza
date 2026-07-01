"use server";

import { prisma, prismaUnsafe } from "@/lib/prisma/client";
import {
  getResendClient,
  getResendFromAddress,
} from "@/lib/services/email/resend-client";
import { captureLeadSchema, type CaptureLeadInput } from "@/lib/validators/promoter";

/**
 * Captura pública de un interesado desde la página de la vacante ("Me interesa").
 *
 * Sin auth: el visitante es anónimo. Bootstrap legítimo con `prismaUnsafe` para
 * resolver el token → tenantId/linkId (no conocemos el tenant aún); el Lead se
 * crea con `prisma` pasando tenantId explícito. NUNCA se loguea el token.
 */
export async function actionCaptureLead(input: CaptureLeadInput): Promise<void> {
  const { token, name, phone, email, message } = captureLeadSchema.parse(input);

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

  await prisma.lead.create({
    data: {
      tenantId: link.tenantId,
      promoterLinkId: link.id,
      name,
      phone,
      email: email ?? null,
      message: message ?? null,
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
