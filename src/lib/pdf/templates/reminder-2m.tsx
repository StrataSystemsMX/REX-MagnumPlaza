import React from "react";
import {
  OverdueReminderPdf,
  type OverdueReminderProps,
} from "./overdue-reminder";

/** Aviso formal (2 meses vencidos). Tono: notificación con plazo. */
export function Reminder2MPdf(
  props: Omit<OverdueReminderProps, "level"> & { level?: "2M" },
) {
  return <OverdueReminderPdf {...props} level="2M" />;
}
