/**
 * Cliente HTTP para WhatsApp Cloud API (Meta).
 *
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Modo desarrollo: si WHATSAPP_ACCESS_TOKEN no está definido, en lugar de
 * llamar a Graph API loguea el envío y devuelve un messageId fake. Esto
 * permite a los desarrolladores avanzar sin configurar la cuenta real.
 *
 * Errores conocidos que mapeamos:
 *   - 130429 / 80007 → rate limited
 *   - 132000 → plantilla no aprobada o nombre inválido
 *   - 131000 / 131005 → número inválido o no en WhatsApp
 *   - 131047 → fuera de la ventana de servicio (24h)
 */

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

export interface WhatsAppTemplateParameter {
  /** Solo soportamos parámetros de tipo texto en plantillas. */
  type: "text";
  text: string;
}

export interface WhatsAppSendResult {
  messageId: string;
  status: "SENT" | "SIMULATED";
}

export class WhatsAppError extends Error {
  readonly code: WhatsAppErrorCode;
  readonly graphCode: number | null;
  readonly graphMessage: string | null;

  constructor(
    code: WhatsAppErrorCode,
    message: string,
    options: { graphCode?: number; graphMessage?: string } = {},
  ) {
    super(message);
    this.name = "WhatsAppError";
    this.code = code;
    this.graphCode = options.graphCode ?? null;
    this.graphMessage = options.graphMessage ?? null;
  }
}

export type WhatsAppErrorCode =
  | "NOT_CONFIGURED"
  | "TEMPLATE_NOT_APPROVED"
  | "INVALID_NUMBER"
  | "NOT_ON_WHATSAPP"
  | "RATE_LIMITED"
  | "OUTSIDE_SERVICE_WINDOW"
  | "UNKNOWN";

interface GraphMessageResponse {
  messages?: Array<{ id: string }>;
  error?: GraphError;
}

interface GraphError {
  code: number;
  message: string;
  error_subcode?: number;
  error_data?: { details?: string };
}

/** ¿Tenemos credenciales reales para mandar a Graph API? */
export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env["WHATSAPP_ACCESS_TOKEN"] && process.env["WHATSAPP_PHONE_NUMBER_ID"],
  );
}

/**
 * Normaliza un número a formato E.164 sin signos. Acepta "+52 662 ..." o
 * "662-...-..." o ya formateado. Rechaza si no quedan al menos 10 dígitos.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D+/g, "");
  if (digits.length < 10) {
    throw new WhatsAppError(
      "INVALID_NUMBER",
      `Número de teléfono inválido: "${input}"`,
    );
  }
  // México por default si vienen 10 dígitos.
  return digits.length === 10 ? `52${digits}` : digits;
}

/**
 * Envía un mensaje basado en plantilla pre-aprobada en Meta Business.
 *
 * Las variables se pasan como array ordenado: parameters[0] reemplaza {1},
 * parameters[1] reemplaza {2}, etc.
 *
 * En modo dev (sin token) loguea y devuelve un messageId simulado.
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  parameters: ReadonlyArray<string>,
  options: { languageCode?: string } = {},
): Promise<WhatsAppSendResult> {
  const phone = normalizePhone(to);
  const languageCode = options.languageCode ?? "es_MX";

  if (!isWhatsAppConfigured()) {
    const fakeId = `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.info(
      `[FAKE WHATSAPP] sería enviado a +${phone} con plantilla ${templateName} (${languageCode}) y params ${JSON.stringify(parameters)} → messageId ${fakeId}`,
    );
    return { messageId: fakeId, status: "SIMULATED" };
  }

  const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"]!;
  const accessToken = process.env["WHATSAPP_ACCESS_TOKEN"]!;

  const body = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components:
        parameters.length > 0
          ? [
              {
                type: "body",
                parameters: parameters.map(
                  (text): WhatsAppTemplateParameter => ({ type: "text", text }),
                ),
              },
            ]
          : [],
    },
  };

  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as GraphMessageResponse;
  if (!res.ok || json.error) {
    throw mapGraphError(json.error, res.status);
  }
  const messageId = json.messages?.[0]?.id;
  if (!messageId) {
    throw new WhatsAppError(
      "UNKNOWN",
      "Graph API respondió OK pero sin messageId.",
    );
  }
  return { messageId, status: "SENT" };
}

/**
 * Envía texto libre. Solo funciona si el inquilino respondió en las últimas
 * 24 horas (ventana de servicio de Meta). Si no, Graph devuelve 131047 y
 * mapeamos a OUTSIDE_SERVICE_WINDOW.
 */
export async function sendTextMessage(
  to: string,
  text: string,
): Promise<WhatsAppSendResult> {
  const phone = normalizePhone(to);

  if (!isWhatsAppConfigured()) {
    const fakeId = `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.info(`[FAKE WHATSAPP] texto a +${phone}: "${text}" → ${fakeId}`);
    return { messageId: fakeId, status: "SIMULATED" };
  }

  const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"]!;
  const accessToken = process.env["WHATSAPP_ACCESS_TOKEN"]!;

  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: text },
    }),
  });

  const json = (await res.json()) as GraphMessageResponse;
  if (!res.ok || json.error) {
    throw mapGraphError(json.error, res.status);
  }
  const messageId = json.messages?.[0]?.id;
  if (!messageId) {
    throw new WhatsAppError(
      "UNKNOWN",
      "Graph API respondió OK pero sin messageId.",
    );
  }
  return { messageId, status: "SENT" };
}

export interface MessageStatus {
  /** Estado conocido. "unknown" si Graph no devuelve fila. */
  status: "sent" | "delivered" | "read" | "failed" | "unknown";
  raw?: unknown;
}

/**
 * Consulta el estado de un mensaje. La API real expone esto vía webhooks
 * (los status events llegan a /api/webhooks/whatsapp), pero también dejamos
 * el GET por si se quiere refrescar manualmente desde la UI. En modo dev
 * regresa "unknown" — los messageIds fake no existen en Graph.
 */
export async function getMessageStatus(messageId: string): Promise<MessageStatus> {
  if (!isWhatsAppConfigured() || messageId.startsWith("fake-")) {
    return { status: "unknown" };
  }
  const accessToken = process.env["WHATSAPP_ACCESS_TOKEN"]!;
  try {
    const res = await fetch(`${GRAPH_BASE}/${messageId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { status: "unknown" };
    const json = (await res.json()) as { status?: string };
    const s = json.status;
    if (s === "sent" || s === "delivered" || s === "read" || s === "failed") {
      return { status: s, raw: json };
    }
    return { status: "unknown", raw: json };
  } catch {
    return { status: "unknown" };
  }
}

function mapGraphError(err: GraphError | undefined, httpStatus: number): WhatsAppError {
  if (!err) {
    return new WhatsAppError("UNKNOWN", `Graph API HTTP ${httpStatus}`);
  }
  const meta = { graphCode: err.code, graphMessage: err.message };
  switch (err.code) {
    case 130429:
    case 80007:
      return new WhatsAppError("RATE_LIMITED", "WhatsApp rate limit alcanzado.", meta);
    case 132000:
    case 132001:
    case 132005:
      return new WhatsAppError(
        "TEMPLATE_NOT_APPROVED",
        "Plantilla no aprobada o nombre/idioma inválido.",
        meta,
      );
    case 131000:
    case 131005:
    case 131008:
      return new WhatsAppError("INVALID_NUMBER", "Número inválido.", meta);
    case 131026:
    case 131051:
      return new WhatsAppError(
        "NOT_ON_WHATSAPP",
        "El destinatario no tiene WhatsApp.",
        meta,
      );
    case 131047:
      return new WhatsAppError(
        "OUTSIDE_SERVICE_WINDOW",
        "Fuera de la ventana de servicio (24h). Usa una plantilla.",
        meta,
      );
    default:
      return new WhatsAppError("UNKNOWN", err.message, meta);
  }
}
