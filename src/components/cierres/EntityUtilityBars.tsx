import { cn } from "@/lib/utils";
import { themeFor } from "./MonthlyPivotTable";

const MXN_INT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

interface EntityUtilityBarsProps {
  entities: ReadonlyArray<{
    code: string;
    income: string;
    expense: string;
    utility: string;
  }>;
  /** Etiqueta del periodo (ej. "Marzo 2026" o "Ejercicio 2026"). */
  periodLabel?: string;
}

/**
 * Sub-tabla "Utilidad por razón social". Una fila por entidad con dot, código,
 * monto y barra horizontal proporcional al valor absoluto máximo. Utilidades
 * negativas se pintan en rosa.
 */
export function EntityUtilityBars({ entities, periodLabel }: EntityUtilityBarsProps) {
  if (entities.length === 0) return null;

  const max = Math.max(
    ...entities.map((e) => Math.abs(Number(e.utility))),
    1,
  );

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-muted-foreground">
        <span>Utilidad por razón social</span>
        {periodLabel ? (
          <span className="text-xs font-normal text-muted-foreground/70">
            · {periodLabel}
          </span>
        ) : null}
      </h3>
      <div className="space-y-2.5">
        {entities.map((e) => {
          const utility = Number(e.utility);
          const theme = themeFor(e.code);
          const pct = (Math.abs(utility) / max) * 100;
          const isNegative = utility < 0;
          return (
            <div key={e.code} className="flex items-center gap-3">
              <div className="flex w-16 shrink-0 items-center gap-2">
                <span
                  className={cn("size-2 shrink-0 rounded-full", theme.dot)}
                  aria-hidden
                />
                <span className="text-sm font-semibold">{e.code}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isNegative ? "bg-rose-500" : theme.bar,
                    )}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    Ing {MXN_INT.format(Number(e.income))} · Eg{" "}
                    {MXN_INT.format(Number(e.expense))}
                  </span>
                </div>
              </div>
              <div
                className={cn(
                  "w-24 shrink-0 text-right text-sm font-semibold tabular-nums",
                  isNegative ? "text-rose-700" : "",
                )}
              >
                {MXN_INT.format(utility)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
