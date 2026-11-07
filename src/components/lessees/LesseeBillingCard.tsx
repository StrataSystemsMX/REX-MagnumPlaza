import { Landmark, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isPlaza } from "@/shared/i18n/unit-label";
import type { LesseeDetail } from "@/server/services/lessees-queries";
import { formatMXN } from "@/shared/format-currency";

type Contract = LesseeDetail["contracts"][number];

/** Parseo numérico seguro: null/undefined/NaN → null (nunca produce $NaN). */
function num(value: unknown): number | null {
  if (value == null) return null; // cubre null y undefined
  const n = Number(value);
  return Number.isFinite(n) ? n : null; // cubre NaN
}

/** Fila de concepto: etiqueta a la izquierda, monto tabular a la derecha. */
function ConceptRow({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-1.5 ${
        emphasis ? "border-t font-semibold" : ""
      }`}
    >
      <span className={`text-sm ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className="tabular-nums text-sm">{value}</span>
    </div>
  );
}

/**
 * Ficha de facturación tal como el cliente la maneja en su Excel: desglose de
 * conceptos (renta base + mantenimiento + IVA), forma de pago y cuenta por cada
 * contrato activo del inquilino.
 */
export function LesseeBillingCard({ contracts }: { contracts: ReadonlyArray<Contract> }) {
  const active = contracts.filter((c) => c.status === "ACTIVE");
  if (active.length === 0) return null;

  return (
    <div className="space-y-4">
      {active.map((c) => {
        const base = num(c.baseRent);
        const maint = num(c.maintenanceFee);
        const total = num(c.monthlyAmount);
        const hasBreakdown = base !== null || maint !== null;
        const subtotal = hasBreakdown ? (base ?? 0) + (maint ?? 0) : null;
        const iva = subtotal !== null && total !== null ? total - subtotal : null;
        const lateFee = num(c.lateFeePercentage);

        return (
          <div key={c.id} className="rounded-md border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ReceiptText className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{c.unit.property.name}</p>
                  {isPlaza(c.unit.property.type) ? (
                    <p className="text-xs text-muted-foreground">
                      {c.unit.code}
                      {c.unit.name ? ` — ${c.unit.name}` : ""}
                    </p>
                  ) : null}
                </div>
              </div>
              {c.paymentMethodNote ? (
                <Badge variant="secondary" className="font-normal">
                  {c.paymentMethodNote}
                </Badge>
              ) : null}
            </div>

            <div className="divide-y">
              {base !== null ? (
                <ConceptRow label="Concepto 1 · Renta base" value={formatMXN(base, 2)} />
              ) : null}
              {maint !== null ? (
                <ConceptRow
                  label="Concepto 2 · Cuota de mantenimiento"
                  value={formatMXN(maint, 2)}
                />
              ) : null}
              {subtotal !== null ? (
                <ConceptRow label="Subtotal" value={formatMXN(subtotal, 2)} muted />
              ) : null}
              {iva !== null ? (
                <ConceptRow label="IVA (16%)" value={formatMXN(iva, 2)} muted />
              ) : null}
              <ConceptRow
                label="Total mensual"
                value={total !== null ? formatMXN(total, 2) : "—"}
                emphasis
              />
              <ConceptRow
                label="Concepto 3 · Interés moratorio"
                value={lateFee !== null ? `${lateFee}%` : "—"}
                muted
              />
            </div>

            {c.bankAccount ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Landmark className="size-3.5" />
                Cuenta: <span className="font-mono">{c.bankAccount}</span>
              </div>
            ) : null}

            {c.notes ? (
              <p className="mt-3 rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {c.notes}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
