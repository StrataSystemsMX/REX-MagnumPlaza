"use client";

import { Building2, Ellipsis, HandCoins, LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import { useMobileCapture } from "@/components/mobile/MobileCaptureProvider";
import { activeTab, type MobileTab } from "@/shared/mobile/nav";
import { cn } from "@/shared/utils";

const TABS: Array<{
  tab: MobileTab;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { tab: "inicio", href: "/", label: "Inicio", icon: LayoutDashboard },
  { tab: "cobranza", href: "/collections", label: "Cobranza", icon: HandCoins },
  { tab: "propiedades", href: "/plazas", label: "Propiedades", icon: Building2 },
  { tab: "mas", href: "/mas", label: "Más", icon: Ellipsis },
];

export function MobileTabBar({ overdueCount }: { overdueCount: number }) {
  const pathname = usePathname();
  const from = useSearchParams().get("from");
  const current = activeTab(pathname, from);
  const { canCapture, openQuick } = useMobileCapture();

  const renderTab = (t: (typeof TABS)[number]) => {
    const active = current === t.tab;
    return (
      <Link
        key={t.tab}
        href={t.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-16 flex-col items-center gap-[3px] pt-0.5 text-[10.5px] font-medium",
          active ? "text-primary" : "text-[oklch(0.6_0.03_240)]",
        )}
      >
        <span className="relative">
          <t.icon className="size-6" />
          {t.tab === "cobranza" && overdueCount > 0 ? (
            <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
              {overdueCount > 99 ? "99+" : overdueCount}
            </span>
          ) : null}
        </span>
        {t.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 flex items-start justify-around border-t border-border bg-white/[.88] px-2.5 pt-2 pb-[max(26px,env(safe-area-inset-bottom))] backdrop-blur-[20px] dark:bg-card/90"
    >
      {TABS.slice(0, 2).map(renderTab)}
      {canCapture ? (
        <button
          type="button"
          onClick={openQuick}
          aria-label="Capturar"
          className="-mt-[18px] flex size-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_18px_rgba(0,44,85,.35)]"
        >
          <Plus className="size-[26px]" strokeWidth={2.2} />
        </button>
      ) : null}
      {TABS.slice(2).map(renderTab)}
    </nav>
  );
}
