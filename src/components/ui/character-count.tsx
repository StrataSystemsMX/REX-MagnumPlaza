import { cn } from "@/lib/utils";

interface CharacterCountProps {
  current: number;
  max: number;
  className?: string;
}

export function CharacterCount({ current, max, className }: CharacterCountProps) {
  const ratio = current / max;

  if (ratio < 0.7) return null;

  const colorClass =
    ratio >= 1
      ? "text-destructive"
      : ratio >= 0.95
        ? "text-amber-500"
        : "text-muted-foreground";

  return (
    <p className={cn("text-xs text-right tabular-nums", colorClass, className)}>
      {current}/{max}
    </p>
  );
}
