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

// Histórico real extraído del Excel del cliente (2009–2025)
const HISTORICAL_DATA = [
  { year: 2009, ventas: 1327588, egresos: 1286848 },
  { year: 2010, ventas: 1446707, egresos: 1593119 },
  { year: 2011, ventas: 1894737, egresos: 1787146 },
  { year: 2012, ventas: 1870829, egresos: 1686576 },
  { year: 2013, ventas: 1896607, egresos: 1819711 },
  { year: 2014, ventas: 2189922, egresos: 1850816 },
  { year: 2015, ventas: 2570633, egresos: 1879458 },
  { year: 2016, ventas: 3078210, egresos: 2207479 },
  { year: 2017, ventas: 3061569, egresos: 2540400 },
  { year: 2018, ventas: 4258247, egresos: 2631131 },
  { year: 2019, ventas: 4036111, egresos: 3102750 },
  { year: 2020, ventas: 3748963, egresos: 3025056 },
  { year: 2021, ventas: 4284458, egresos: 3303683 },
  { year: 2022, ventas: 4685353, egresos: 3832827 },
  { year: 2023, ventas: 5502671, egresos: 3918866 },
  { year: 2024, ventas: 5338729, egresos: 3762540 },
  { year: 2025, ventas: 5596475, egresos: 4066478 },
];

export interface FinancialHistoryChartProps {
  current?: { year: number; ventas: number; egresos: number };
}

export function FinancialHistoryChart({ current }: FinancialHistoryChartProps) {
  const data = current
    ? [...HISTORICAL_DATA.filter((d) => d.year < current.year), current]
    : HISTORICAL_DATA;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v: number) => MXN_COMPACT.format(v)}
          />
          <Tooltip
            formatter={(value) => MXN_FULL.format(Number(value))}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="ventas"  name="Ventas"  stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="egresos" name="Egresos" stroke="#94a3b8" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

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

export interface MorosityTrendChartProps {
  data: Array<{ month: string; occupancyRate: number }>;
}

export function MorosityTrendChart({ data }: MorosityTrendChartProps) {
  const chartData = data.map((d) => ({
    month: monthShortLabel(d.month),
    Ocupación: Math.round(d.occupancyRate * 100),
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
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            formatter={(value) => `${Number(value)}%`}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="Ocupación"
            stroke="#3b82f6"
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
