import type { ComponentType, ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MetricTrendDirection = "up" | "down" | "flat";

export interface MetricTrend {
  direction: MetricTrendDirection;
  /** Texto a mostrar junto al icono — ej. "+12% vs mes anterior". */
  label: string;
  /** Si true, "up" se considera bueno (default). Útil para morosidad: ahí "up" es malo. */
  upIsGood?: boolean;
}

export type MetricColor = "default" | "success" | "warning" | "danger";

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  subValue?: ReactNode;
  trend?: MetricTrend;
  icon?: ComponentType<{ className?: string }>;
  color?: MetricColor;
  /** Detalle adicional al pie. Ideal para listas tipo "1M: 3 · 2M: 1 · 3M: 0". */
  footer?: ReactNode;
}

/**
 * Card grande de KPI. Diseño tipográfico: número enorme, label arriba pequeño,
 * trend con flecha y color según si subir es bueno o malo.
 */
export function MetricCard({
  label,
  value,
  subValue,
  trend,
  icon: Icon,
  color = "default",
  footer,
}: MetricCardProps) {
  return (
    <Card className={cn("h-full", colorBorder(color))}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? <Icon className={cn("size-4", colorIcon(color))} /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className={cn("text-3xl font-semibold tracking-tight", colorValue(color))}>
          {value}
        </div>
        {subValue ? <div className="text-xs text-muted-foreground">{subValue}</div> : null}
        {trend ? <TrendBadge trend={trend} /> : null}
        {footer ? <div className="mt-1 text-xs text-muted-foreground">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}

function TrendBadge({ trend }: { trend: MetricTrend }) {
  const upIsGood = trend.upIsGood ?? true;
  const isGood =
    trend.direction === "flat"
      ? null
      : (trend.direction === "up") === upIsGood;
  const Icon =
    trend.direction === "up" ? ArrowUp : trend.direction === "down" ? ArrowDown : ArrowRight;
  const cls =
    isGood === null
      ? "text-muted-foreground"
      : isGood
        ? "text-emerald-600"
        : "text-rose-600";
  return (
    <div className={cn("flex items-center gap-1 text-xs", cls)}>
      <Icon className="size-3" />
      <span>{trend.label}</span>
    </div>
  );
}

function colorBorder(color: MetricColor): string {
  switch (color) {
    case "success":
      return "ring-emerald-500/20";
    case "warning":
      return "ring-amber-500/30";
    case "danger":
      return "ring-rose-500/30";
    default:
      return "";
  }
}

function colorIcon(color: MetricColor): string {
  switch (color) {
    case "success":
      return "text-emerald-600";
    case "warning":
      return "text-amber-600";
    case "danger":
      return "text-rose-600";
    default:
      return "text-muted-foreground";
  }
}

function colorValue(color: MetricColor): string {
  switch (color) {
    case "danger":
      return "text-rose-700";
    default:
      return "";
  }
}
