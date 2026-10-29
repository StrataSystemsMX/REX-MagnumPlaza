"use client";

import { HandCoins, MessageCircle, Phone } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useMobileCapture } from "@/components/mobile/MobileCaptureProvider";
import type { MobileRent } from "@/server/services/mobile-queries";
import { cn } from "@/shared/utils";

function digits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `52${d}` : d;
}

/** Acciones del detalle de inquilino: Registrar pago · WhatsApp · Llamar. */
export function MobileLesseeActions({
  payRent,
  whatsapp,
  phone,
}: {
  payRent: MobileRent | null;
  whatsapp: string | null;
  phone: string | null;
}) {
  const { canRegisterPayment, openPayment } = useMobileCapture();
  const canPay = canRegisterPayment && payRent !== null;

  return (
    <div className="grid grid-cols-3 gap-2">
      <Action
        icon={HandCoins}
        primary
        disabled={!canPay}
        onClick={() => payRent && openPayment(payRent)}
      >
        Registrar pago
      </Action>
      <Action icon={MessageCircle} href={whatsapp ? `https://wa.me/${digits(whatsapp)}` : undefined}>
        WhatsApp
      </Action>
      <Action icon={Phone} href={phone ? `tel:+${digits(phone)}` : undefined}>
        Llamar
      </Action>
    </div>
  );
}

function Action({
  icon: Icon,
  primary = false,
  disabled = false,
  href,
  onClick,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  primary?: boolean;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const cls = cn(
    "flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 text-[12.5px] font-medium",
    primary
      ? "bg-primary text-primary-foreground"
      : "bg-card text-primary shadow-[0_0_0_1px_rgba(11,14,41,.08)]",
    "aria-disabled:pointer-events-none aria-disabled:opacity-45",
  );
  const content = (
    <>
      <Icon className="size-5" />
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-disabled={disabled || undefined} className={cls}>
        {content}
      </button>
    );
  }
  return (
    <a
      href={href}
      aria-disabled={!href || undefined}
      target={href?.startsWith("https") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className={cls}
    >
      {content}
    </a>
  );
}
