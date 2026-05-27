"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Monthly12 } from "@/lib/services/cierres-queries";

const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const MXN_COMPACT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});

const MXN_FULL = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

interface UtilityMonthlyChartProps {
  income: Monthly12;
  expense: Monthly12;
  /** Mes 1-12 a resaltar. Los demás meses se atenúan. */
  highlightMonth?: number | null;
  /** Callback al hacer clic en una barra de mes. */
  onMonthClick?: (month: number) => void;
}

export function UtilityMonthlyChart({
  income,
  expense,
  highlightMonth = null,
  onMonthClick,
}: UtilityMonthlyChartProps) {
  const data = MONTHS_SHORT.map((m, i) => {
    const ing = Number(income[i] ?? "0");
    const eg = Number(expense[i] ?? "0");
    return {
      month: m,
      monthIndex: i,
      ingresos: ing,
      egresos: -eg, // negativo para que se vea debajo del eje
      utilidad: ing - eg,
    };
  });

  const opacityFor = (i: number) =>
    highlightMonth === null ? 1 : highlightMonth === i + 1 ? 1 : 0.25;

  // recharts pasa el data point como primer argumento; usamos `any` localmente
  // porque la firma upstream no expone la forma del objeto sin overload manual.
  const handleBarClick = onMonthClick
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (entry: any) => {
        const idx = entry?.monthIndex;
        if (typeof idx === "number") {
          onMonthClick(idx + 1);
        }
      }
    : undefined;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="month"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v: number) => MXN_COMPACT.format(v)}
          />
          <Tooltip
            formatter={(value, name) => [
              MXN_FULL.format(Math.abs(Number(value))),
              name,
            ]}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="ingresos"
            name="Ingresos"
            radius={[3, 3, 0, 0]}
            {...(handleBarClick ? { onClick: handleBarClick, cursor: "pointer" } : {})}
          >
            {data.map((_, i) => (
              <Cell key={i} fill="#10b981" fillOpacity={opacityFor(i)} />
            ))}
          </Bar>
          <Bar
            dataKey="egresos"
            name="Egresos"
            radius={[3, 3, 0, 0]}
            {...(handleBarClick ? { onClick: handleBarClick, cursor: "pointer" } : {})}
          >
            {data.map((_, i) => (
              <Cell key={i} fill="#ef4444" fillOpacity={opacityFor(i)} />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="utilidad"
            name="Utilidad"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
