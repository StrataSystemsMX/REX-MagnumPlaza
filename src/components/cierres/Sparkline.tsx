import { cn } from "@/shared/utils";

interface SparklineProps {
  /** Valores como strings (vienen de Decimal serializados) o numbers. */
  values: ReadonlyArray<string | number>;
  /** Tailwind class para el color de las barras (ej. "fill-orange-500"). */
  className?: string;
  width?: number;
  height?: number;
}

/**
 * Mini-gráfica SVG inline de barras verticales. Pensada para headers
 * colapsados donde montar un `recharts BarChart` con ResponsiveContainer
 * sería overhead. Sin tooltip, sin ejes — solo la silueta de tendencia.
 */
export function Sparkline({
  values,
  className,
  width = 84,
  height = 22,
}: SparklineProps) {
  const nums = values.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.abs(n) : 0;
  });
  const max = Math.max(...nums, 1);
  const barCount = nums.length;
  const gap = 1;
  const barWidth = (width - gap * (barCount - 1)) / barCount;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Tendencia mensual"
    >
      {nums.map((v, i) => {
        const h = Math.max(1, (v / max) * height);
        const x = i * (barWidth + gap);
        const y = height - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            rx={0.5}
            className={v === 0 ? "opacity-20" : ""}
          />
        );
      })}
    </svg>
  );
}
