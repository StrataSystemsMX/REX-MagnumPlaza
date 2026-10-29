import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { RentStatusBadge } from "@/components/shared/RentStatusBadge";
import type { ContractStatus, RentStatus } from "@/generated/prisma/enums";
import { contractStatusLabel } from "@/shared/i18n/enums";
import { cn } from "@/shared/utils";

// Primitivos visuales de Rex móvil (handoff "Rex Mobile"). Sin hooks: sirven
// igual en Server y Client Components.

/** Card base: blanco, radius 14, ring foreground/10 (igual que MetricCard). */
export function MobileCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[14px] bg-card shadow-[0_0_0_1px_rgba(11,14,41,.08)]", className)}
      {...props}
    />
  );
}

export function MobilePageHeader({
  title,
  subtitle,
  size = "lg",
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** lg = pantallas raíz (30px); md = pantallas de detalle (26px). */
  size?: "lg" | "md";
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 pt-1">
      <div className="min-w-0">
        <h1
          className={cn(
            "font-heading font-bold leading-[1.1] tracking-[-0.02em]",
            size === "lg" ? "text-[30px]" : "text-[26px]",
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <div className="mt-[3px] text-[13px] text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
      {right}
    </div>
  );
}

export function MobileScreen({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-3.5 px-4 pt-2", className)} {...props} />;
}

export function MobileSectionTitle({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("text-sm font-semibold", className)} {...props} />;
}

export function MobileKpiLabel({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** "‹ Cobranza" — regreso a la pantalla anterior del stack. */
export function MobileBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-ml-1.5 inline-flex min-h-10 items-center self-start text-base text-primary"
    >
      <ChevronLeft className="size-6" />
      {label}
    </Link>
  );
}

export interface SegmentOption {
  label: ReactNode;
  href: string;
  active: boolean;
}

/** Segmented control navegable (el estado vive en la URL). */
export function MobileSegmentedLinks({
  options,
  fullWidth = false,
  className,
}: {
  options: SegmentOption[];
  fullWidth?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-[10px] bg-muted p-[3px]", className)}>
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          replace
          scroll={false}
          aria-current={o.active ? "page" : undefined}
          className={cn(
            "rounded-[7px] text-center font-medium transition-colors",
            fullWidth ? "flex-1 px-3 py-2 text-sm" : "px-3 py-1.5 text-[13px]",
            o.active
              ? "bg-card text-foreground shadow-[0_1px_2px_rgba(11,14,41,.12)]"
              : "text-muted-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function mobileChipClass(active: boolean): string {
  return cn(
    "flex-none whitespace-nowrap rounded-full border px-[13px] py-1.5 text-[13px] font-medium transition-colors",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-card text-foreground",
  );
}

/** Fila de chips con scroll horizontal (sin scrollbar), a sangre del gutter. */
export function MobileChipRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function MobileChipLinks({ options }: { options: SegmentOption[] }) {
  return (
    <MobileChipRow>
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          replace
          scroll={false}
          aria-current={o.active ? "page" : undefined}
          className={mobileChipClass(o.active)}
        >
          {o.label}
        </Link>
      ))}
    </MobileChipRow>
  );
}

/** Badge de estado de renta en tamaño móvil (mismos colores que RentStatusBadge). */
export function MobileRentBadge({ status }: { status: RentStatus }) {
  return (
    <RentStatusBadge
      status={status}
      className="h-auto rounded-[6px] px-1.5 py-px text-[11px] font-medium"
    />
  );
}

/** Punto de estado de renta (tira de ocupación, grid de locales, lista de inquilinos). */
export const RENT_STATUS_DOT: Record<RentStatus, string> = {
  PAID: "bg-green-500",
  PARTIAL: "bg-amber-500",
  PENDING: "bg-[oklch(0.8_0.03_230)]",
  DUE: "bg-orange-400",
  OVERDUE_1M: "bg-orange-500",
  OVERDUE_2M: "bg-red-500",
  OVERDUE_3M: "bg-red-700",
  WAIVED: "bg-blue-400",
};

export function rentStatusDot(status: RentStatus | null): string {
  return status ? RENT_STATUS_DOT[status] : "bg-secondary";
}

/** Pill del badge "Inquilinos con Adeudo" (dashboard) según el peor estado. */
export function overduePill(status: RentStatus): { label: string; className: string } {
  switch (status) {
    case "OVERDUE_3M":
      return { label: "3 meses", className: "bg-red-600 text-white" };
    case "OVERDUE_2M":
      return { label: "2 meses", className: "bg-red-100 text-red-700" };
    case "OVERDUE_1M":
      return { label: "1 mes", className: "bg-orange-100 text-orange-700" };
    default:
      return { label: "Vencido", className: "bg-amber-100 text-amber-700" };
  }
}

/** Pill de contrato. "Por renovar" = vence en ≤60 días (misma regla que /contracts). */
export function contractPill(contract: { status: ContractStatus; daysToExpire: number }): {
  label: string;
  className: string;
} {
  const { status, daysToExpire } = contract;
  const live = status === "ACTIVE" || status === "PENDING_RENEWAL";
  if (status === "EXPIRED" || (live && daysToExpire < 0)) {
    return { label: "Vencido", className: "bg-red-100 text-red-700" };
  }
  if (status === "PENDING_RENEWAL" || (status === "ACTIVE" && daysToExpire <= 60)) {
    return { label: "Por renovar", className: "bg-[oklch(0.96_0.03_85)] text-warning" };
  }
  if (status === "ACTIVE") return { label: "Activo", className: "bg-green-100 text-green-700" };
  return { label: contractStatusLabel(status), className: "bg-secondary text-primary" };
}

export function MobilePill({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", className)}
      {...props}
    />
  );
}

/** Fila de lista tappable (Link) con chevron opcional. */
export function MobileListLink({
  href,
  className,
  chevron = false,
  children,
}: {
  href: string;
  className?: string;
  chevron?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 border-b border-muted px-3.5 py-3 last:border-b-0 active:bg-background",
        className,
      )}
    >
      {children}
      {chevron ? <ChevronRight className="size-4 shrink-0 text-[oklch(0.7_0.05_230)]" /> : null}
    </Link>
  );
}

export function MobileEmpty({ children }: { children: ReactNode }) {
  return <div className="p-7 text-center text-[13px] text-muted-foreground">{children}</div>;
}

/** Barra de progreso redondeada (cobranza). */
export function MobileProgress({
  pct,
  barClassName,
  height = "h-2",
  ringed = false,
}: {
  pct: number;
  barClassName: string;
  height?: string;
  ringed?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-full bg-muted",
        height,
        ringed && "shadow-[inset_0_0_0_1px_var(--border)]",
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", barClassName)}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  );
}
