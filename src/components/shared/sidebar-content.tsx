"use client";

import { Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./sidebar-nav-config";

interface SidebarContentProps {
  onLinkClick?: () => void;
}

export function SidebarContent({ onLinkClick }: SidebarContentProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
      {/* Logo */}
      <div className="flex shrink-0 flex-col gap-1 border-b border-sidebar-border px-5 py-4">
        <div className="flex items-center gap-3">
          <Image
            src="/logo/StrataSystem_logo.png"
            alt="Strata Systems"
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-lg object-cover"
            priority
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Rex</p>
            <p className="text-xs text-sidebar-foreground/50">Administrador Inmobiliario</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group, gi) => (
          <div
            key={gi}
            className={cn(
              gi > 0 && "mt-1 border-t border-sidebar-border/40 pt-5",
            )}
          >
            {group.label && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon   = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onLinkClick}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                        : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
        <Link
          href="/configuracion"
          onClick={onLinkClick}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            isActive("/configuracion")
              ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
              : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <Settings className="size-4 shrink-0" />
          <span>Configuración</span>
        </Link>
        <p className="mt-3 px-3 text-[10px] text-sidebar-foreground/30">
          powered by Strata Systems MX
        </p>
      </div>
    </>
  );
}
