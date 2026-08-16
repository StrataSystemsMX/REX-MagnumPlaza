import { Badge } from "@/components/ui/badge";
import { rentStatusLabel } from "@/shared/i18n/enums";
import { cn } from "@/shared/utils";
import type { RentStatus } from "@/generated/prisma/enums";

/**
 * Clases por estado — reflejan los colores del calendario del cliente:
 * verde=PAID, amarillo=PARTIAL, gris=PENDING, naranja=DUE/OVERDUE_1M,
 * rojo=OVERDUE_2M/3M, azul=WAIVED.
 */
const STATUS_CLASSES: Record<RentStatus, string> = {
  PAID: "border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  PARTIAL:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  PENDING: "border-muted bg-card text-muted-foreground",
  DUE: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200",
  OVERDUE_1M:
    "border-orange-500 bg-orange-200 text-orange-950 dark:border-orange-700 dark:bg-orange-800 dark:text-orange-50",
  OVERDUE_2M:
    "border-red-400 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  OVERDUE_3M:
    "border-red-500 bg-red-100 text-red-950 dark:border-red-800 dark:bg-red-900 dark:text-red-100",
  WAIVED:
    "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
};

interface RentStatusBadgeProps {
  status: RentStatus;
  className?: string;
}

export function RentStatusBadge({ status, className }: RentStatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(STATUS_CLASSES[status], className)}>
      {rentStatusLabel(status)}
    </Badge>
  );
}

/** Devuelve sólo el set de clases (útil para celdas grandes en calendarios). */
export function rentStatusClasses(status: RentStatus): string {
  return STATUS_CLASSES[status];
}
