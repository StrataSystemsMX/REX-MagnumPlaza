import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica la firma `X-Hub-Signature-256` que Meta agrega a cada webhook.
 * El header tiene el formato `sha256=<hex>`. Se compara contra HMAC-SHA256
 * del raw body usando `WHATSAPP_APP_SECRET`.
 *
 * Si el secret no está configurado se considera fallo: en producción nunca
 * debe pasar, y en dev preferimos forzar al equipo a configurar el secret
 * cuando vayan a usar webhooks reales (tests usan stubs, no este path).
 */
export function verifyWhatsAppSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env["WHATSAPP_APP_SECRET"];
  if (!secret) return false;
  if (!header) return false;
  const [algo, sig] = header.split("=");
  if (algo !== "sha256" || !sig) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Estructura simplificada de los status events. Meta envía cambios `sent`,
 * `delivered`, `read`, `failed` para cada messageId previamente generado.
 */
export interface WebhookStatusEvent {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  failureReason: string | null;
}

interface WebhookEntry {
  changes?: Array<{
    value?: {
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        errors?: Array<{ title?: string; message?: string; code?: number }>;
      }>;
    };
  }>;
}

interface WebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

/**
 * Extrae los status events del payload. Ignora silenciosamente cualquier
 * shape inesperado — Meta agrega/quita campos sin previo aviso.
 */
export function parseStatusEvents(payload: unknown): WebhookStatusEvent[] {
  const out: WebhookStatusEvent[] = [];
  const wp = payload as WebhookPayload;
  if (!wp || wp.object !== "whatsapp_business_account") return out;
  for (const entry of wp.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      for (const s of ch.value?.statuses ?? []) {
        const status = s.status;
        if (
          status !== "sent" &&
          status !== "delivered" &&
          status !== "read" &&
          status !== "failed"
        ) {
          continue;
        }
        const ts = Number(s.timestamp);
        const timestamp = Number.isFinite(ts)
          ? new Date(ts * 1000)
          : new Date();
        const failureReason =
          status === "failed" && s.errors && s.errors.length > 0
            ? s.errors
                .map((e) => e.message ?? e.title)
                .filter(Boolean)
                .join(" · ") || null
            : null;
        out.push({ messageId: s.id, status, timestamp, failureReason });
      }
    }
  }
  return out;
}
