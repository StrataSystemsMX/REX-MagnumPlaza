/**
 * Textos hardcodeados de las plantillas de documentos.
 *
 * Pensado para migrar a "templates editables por tenant" en el futuro:
 * cada plantilla se compone de bloques nombrados (greeting, body, closing,
 * signature), y los datos dinámicos se inyectan vía tokens `{nombre}` que
 * resolveTokens reemplaza al render.
 *
 * Cuando el cliente quiera editar las plantillas, basta con persistir estos
 * objetos en una tabla `DocumentTemplate` por tenant y leer desde ahí.
 */

export interface ReminderTextConfig {
  /** Título grande del documento. */
  title: string;
  /** Saludo de apertura. */
  greeting: string;
  /** Cuerpo principal — admite tokens. */
  body: string;
  /** Bloque legal/aviso al pie del cuerpo. */
  legalNote: string;
  /** Despedida + firma. */
  closing: string;
}

export interface AccountStatementTextConfig {
  title: string;
  intro: string;
  closing: string;
}

/**
 * Tokens disponibles en cada plantilla. resolveTokens hace string-replace
 * simple — si un token no se provee se deja como placeholder.
 */
export function resolveTokens(
  template: string,
  tokens: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key]! : m,
  );
}

export const REMINDER_1M: ReminderTextConfig = {
  title: "Recordatorio de pago",
  greeting: "Estimado(a) {lesseeName}:",
  body:
    "Le recordamos amablemente que su renta correspondiente al mes de " +
    "{period} por la unidad {unitLabel} se encuentra pendiente de pago. " +
    "Lleva {daysOverdue} días de vencida y el saldo a la fecha es de " +
    "{balance}.\n\n" +
    "Si ya realizó el pago, por favor ignore este mensaje y compártanos su " +
    "comprobante para actualizar nuestros registros.",
  legalNote:
    "Conforme a su contrato firmado el {contractSignedDate}, las rentas " +
    "vencen el día {paymentDay} de cada mes. La omisión continuada genera " +
    "intereses moratorios.",
  closing:
    "Quedamos atentos a su pago y a cualquier aclaración.\n\nAtentamente,\n" +
    "{billingEntityName}",
};

export const REMINDER_2M: ReminderTextConfig = {
  title: "Aviso formal de adeudo",
  greeting: "Estimado(a) {lesseeName}:",
  body:
    "Se le notifica formalmente que adeuda 2 meses de renta de la unidad " +
    "{unitLabel}, correspondientes a los periodos en mora. El saldo " +
    "acumulado al día de hoy asciende a {balance} (incluyendo el cargo " +
    "del mes actual).\n\n" +
    "Le solicitamos regularizar su situación dentro de los próximos 15 " +
    "días naturales contados a partir de la recepción de este aviso.",
  legalNote:
    "De no resolverse el adeudo en el plazo señalado, procederemos conforme " +
    "a las cláusulas del contrato firmado el {contractSignedDate}, " +
    "incluyendo el cobro de intereses moratorios y, eventualmente, las " +
    "acciones legales que correspondan.",
  closing:
    "Sin más por el momento, quedamos en espera de su respuesta.\n\n" +
    "Atentamente,\n{billingEntityName}",
};

export const REMINDER_3M: ReminderTextConfig = {
  title: "Notificación de inicio de procedimiento de desalojo",
  greeting: "Sr(a). {lesseeName}:",
  body:
    "Por medio del presente se le notifica el inicio del procedimiento de " +
    "desalojo de la unidad {unitLabel}, derivado del incumplimiento " +
    "reiterado en el pago de la renta. A esta fecha registra un adeudo de " +
    "3 o más meses por un saldo total de {balance}, con {daysOverdue} días " +
    "de vencimiento del cargo más antiguo.",
  legalNote:
    "Esta notificación se emite con fundamento en las cláusulas del contrato " +
    "de arrendamiento firmado el {contractSignedDate}, las cuales facultan " +
    "al arrendador a iniciar el procedimiento legal de desalojo y reclamo " +
    "del adeudo. Cuenta con 5 días hábiles para entregar la unidad o cubrir " +
    "la totalidad del saldo, después de los cuales remitiremos el caso a " +
    "nuestro abogado.",
  closing:
    "Para cualquier aclaración deberá comunicarse directamente con la " +
    "administración.\n\nAtentamente,\n{billingEntityName}",
};

export const ACCOUNT_STATEMENT: AccountStatementTextConfig = {
  title: "Estado de cuenta",
  intro:
    "El presente documento detalla los cargos generados por concepto de " +
    "renta y los pagos aplicados a su(s) contrato(s) vigente(s) con " +
    "{billingEntityName}. La información está actualizada al " +
    "{asOfDate}.",
  closing:
    "Para aclaraciones o solicitar comprobantes específicos, contacte a la " +
    "administración. Este documento se emite con fines informativos y no " +
    "sustituye los CFDI fiscales correspondientes.",
};

export type ReminderLevel = "1M" | "2M" | "3M";

export function reminderConfigByLevel(level: ReminderLevel): ReminderTextConfig {
  switch (level) {
    case "1M":
      return REMINDER_1M;
    case "2M":
      return REMINDER_2M;
    case "3M":
      return REMINDER_3M;
  }
}
