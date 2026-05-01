import React from "react";
import {
  OverdueReminderPdf,
  type OverdueReminderProps,
} from "./overdue-reminder";

/**
 * Aviso amistoso (1 mes vencido). Tono: recordatorio.
 * Re-exporta el componente parametrizado para mantener una fila por nivel
 * en la estructura de archivos que pide el spec.
 */
export function Reminder1MPdf(
  props: Omit<OverdueReminderProps, "level"> & { level?: "1M" },
) {
  return <OverdueReminderPdf {...props} level="1M" />;
}
