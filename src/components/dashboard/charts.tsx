"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

const MONTH_LABEL = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" });

function monthShortLabel(yyyymm: string): string {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return yyyymm;
  return MONTH_LABEL.format(new Date(Date.UTC(y, m - 1, 1)));
}

export interface IncomeChartProps {
  data: Array<{ month: string; expected: string; collected: string }>;
}

export function IncomeChart({ data }: IncomeChartProps) {
  const chartData = data.map((d) => ({
    month: monthShortLabel(d.month),
    Esperado: Number(d.expected),
    Cobrado: Number(d.collected),
  }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickFormatter={(v: number) => MXN_COMPACT.format(Number(v))}
          />
          <Tooltip
            formatter={(value) => MXN_FULL.format(Number(value))}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="Esperado"
            stroke="#94a3b8"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="Cobrado"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface OccupancyChartProps {
  data: Array<{ propertyName: string; occupancyRate: number; totalUnits: number }>;
}

export function OccupancyChart({ data }: OccupancyChartProps) {
  const chartData = data.map((d) => ({
    name: d.propertyName,
    Ocupación: Math.round(d.occupancyRate * 100),
    units: d.totalUnits,
  }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="name"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={60}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            formatter={(value) => `${Number(value)}%`}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="Ocupación" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
