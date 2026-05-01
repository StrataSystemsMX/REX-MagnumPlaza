import React from "react";
import {
  OverdueReminderPdf,
  type OverdueReminderProps,
} from "./overdue-reminder";

/** Carta de inicio de desalojo (3 meses vencidos). Tono: legal. */
export function Reminder3MPdf(
  props: Omit<OverdueReminderProps, "level"> & { level?: "3M" },
) {
  return <OverdueReminderPdf {...props} level="3M" />;
}
