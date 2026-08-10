import { NextResponse } from "next/server";
import { prismaUnsafe } from "@/server/prisma/client";
import { secureCompare } from "@/server/secure-compare";
import {
  parseStatusEvents,
  verifyWhatsAppSignature,
} from "@/server/whatsapp/webhook";
import type { NotificationStatus } from "@/generated/prisma/enums";

/**
 * Webhook de WhatsApp Cloud API.
 *
 * GET — Verificación inicial. Meta manda hub.mode=subscribe + hub.verify_token
 *   + hub.challenge. Si el token coincide con WHATSAPP_VERIFY_TOKEN devolvemos
 *   el challenge en texto plano.
 *
 * POST — Eventos de status (sent / delivered / read / failed). Verificamos la
 *   firma X-Hub-Signature-256 y actualizamos NotificationLog por externalId.
 *
 * Multi-tenant: el lookup por externalId se hace con prismaUnsafe porque al
 * momento del webhook todavía no sabemos a qué tenant pertenece. Es un caso
 * legítimamente "global" (similar al bootstrap de Clerk auth).
 */

const STATUS_MAP: Record<string, NotificationStatus> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env["WHATSAPP_VERIFY_TOKEN"];
  if (!expected) {
    return NextResponse.json(
      { error: "WHATSAPP_VERIFY_TOKEN no configurado." },
      { status: 500 },
    );
  }
  if (mode === "subscribe" && token && secureCompare(token, expected) && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  // Leer raw body para verificar firma byte-a-byte.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // En dev sin app secret, permitimos pasar para poder testear con curl.
  // En prod sin secret la firma falla y devolvemos 401.
  const skipVerify =
    process.env.NODE_ENV !== "production" && !process.env["WHATSAPP_APP_SECRET"];

  if (!skipVerify && !verifyWhatsAppSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const events = parseStatusEvents(payload);
  let updated = 0;
  for (const ev of events) {
    const status = STATUS_MAP[ev.status];
    if (!status) continue;

    // Buscamos por externalId (sin tenantId — bootstrap).
    const log = await prismaUnsafe.notificationLog.findFirst({
      where: { externalId: ev.messageId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!log) continue;

    // Evitar regresiones: read > delivered > sent. failed siempre gana.
    if (!shouldAdvance(log.status as NotificationStatus, status)) continue;

    await prismaUnsafe.notificationLog.update({
      where: { id: log.id },
      data: {
        status,
        deliveredAt: status === "DELIVERED" || status === "READ" ? ev.timestamp : undefined,
        failureReason: status === "FAILED" ? ev.failureReason : undefined,
      },
    });
    updated += 1;
  }

  // Meta espera 200 rápido; si tardamos demasiado, reintenta el webhook.
  return NextResponse.json({ ok: true, processed: events.length, updated });
}

const RANK: Record<NotificationStatus, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  BOUNCED: 4,
  FAILED: 5,
};

function shouldAdvance(current: NotificationStatus, next: NotificationStatus): boolean {
  // FAILED siempre se aplica (sobreescribe SENT/DELIVERED si Meta marca falla).
  if (next === "FAILED") return current !== "FAILED";
  return RANK[next] > RANK[current];
}
