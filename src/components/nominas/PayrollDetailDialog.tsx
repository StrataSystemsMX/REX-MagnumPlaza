"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PayrollListItem } from "@/lib/services/payroll-queries";
import type { PayrollType } from "@/generated/prisma/enums";
import { payrollTypeLabel } from "@/lib/i18n/enums";
import { formatMXN } from "@/lib/format-currency";

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const TYPE_TONES: Record<PayrollType, string> = {
  ADMIN_SERVICE_INVOICE:
    "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200",
  DIRECT_PAYROLL:
    "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200",
  STRATEGY_NOMINA:
    "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200",
  COMMISSION:
    "bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-200",
  BONUS:
    "bg-pink-100 text-pink-700 hover:bg-pink-100 dark:bg-pink-950 dark:text-pink-200",
};

const DATE_FMT = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

interface Props {
  item: PayrollListItem | null;
  canUpdate: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (item: PayrollListItem) => void;
  onDelete: (item: PayrollListItem) => void;
}

export function PayrollDetailDialog({
  item,
  canUpdate,
  canDelete,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Badge className={TYPE_TONES[item.type]}>
                  {payrollTypeLabel(item.type)}
                </Badge>
                {item.description ? <span>{item.description}</span> : null}
              </DialogTitle>
              <DialogDescription>
                {item.legalEntity.code} — {item.legalEntity.legalName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Monto total
                </p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {formatMXN(item.amount, 2)}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <DetailRow
                  label="Periodo"
                  value={`${MONTH_LABELS[item.month - 1]} ${item.year}`}
                />
                <DetailRow label="Tipo" value={payrollTypeLabel(item.type)} />
                <DetailRow
                  label="Monto sin IVA"
                  value={
                    item.amountWithoutTax !== null
                      ? formatMXN(item.amountWithoutTax, 2)
                      : "—"
                  }
                />
                <DetailRow
                  label="IVA"
                  value={
                    item.taxAmount !== null ? formatMXN(item.taxAmount, 2) : "—"
                  }
                />
              </dl>

              {item.notes ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Notas
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {item.notes}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[11px] text-muted-foreground">
                <span>Registrado {DATE_FMT.format(item.createdAt)}</span>
                {item.updatedAt.getTime() !== item.createdAt.getTime() ? (
                  <span>Actualizado {DATE_FMT.format(item.updatedAt)}</span>
                ) : null}
              </div>
            </div>

            {canUpdate || canDelete ? (
              <DialogFooter>
                {canDelete ? (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="size-4" />
                    Eliminar
                  </Button>
                ) : null}
                {canUpdate ? (
                  <Button onClick={() => onEdit(item)}>
                    <Pencil className="size-4" />
                    Editar
                  </Button>
                ) : null}
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
