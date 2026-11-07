import {
  MobileBackLink,
  MobileCard,
  MobileEmpty,
  MobilePageHeader,
  MobileScreen,
} from "@/components/mobile/MobileUI";
import { formatMXN } from "@/shared/format-currency";
import { formatDate, formatPeriodLong } from "@/shared/format-date";
import { currentPeriodStart, shortPropertyName } from "@/shared/mobile/format";
import type { MobileExpenseRow } from "@/server/services/mobile-queries";
import { cn } from "@/shared/utils";

/** Egresos del mes (handoff §9). La captura vive en el sheet "+". */
export function MobileExpenses({ expenses }: { expenses: MobileExpenseRow[] }) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <MobileScreen>
      <MobileBackLink href="/mas" label="Más" />
      <MobilePageHeader
        size="md"
        title="Egresos"
        subtitle={`${formatPeriodLong(currentPeriodStart())} · ${formatMXN(total)}`}
      />

      <MobileCard className="overflow-hidden">
        {expenses.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-3 border-b border-muted px-3.5 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{e.categoryName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {e.legalEntityCode} · {e.propertyName ? shortPropertyName(e.propertyName) : "Oficina"} ·{" "}
                {formatDate(e.expenseDate)}
                {e.hasReceipt ? " · con comprobante" : ""}
              </div>
            </div>
            <div className="flex flex-none flex-col items-end gap-0.5">
              <span className="text-sm font-semibold tabular-nums">{formatMXN(e.amount)}</span>
              <span className={cn("text-[11.5px] font-medium", e.isPaid ? "text-green-700" : "text-warning")}>
                {e.isPaid ? "Pagado" : "Por pagar"}
              </span>
            </div>
          </div>
        ))}
        {expenses.length === 0 ? <MobileEmpty>Sin egresos este mes</MobileEmpty> : null}
      </MobileCard>
    </MobileScreen>
  );
}
