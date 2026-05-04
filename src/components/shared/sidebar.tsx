"use client";

import {
  Archive,
  BarChart2,
  Building2,
  CalendarCheck,
  CalendarDays,
  DoorOpen,
  FileBarChart,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Receipt,
  Settings,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Users2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const GROUPS: ReadonlyArray<NavGroup> = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operación Inmobiliaria",
    items: [
      { href: "/properties",  label: "Plazas / Inmuebles", icon: Building2 },
      { href: "/units",       label: "Locales",            icon: DoorOpen },
      { href: "/lessees",     label: "Inquilinos",         icon: Users },
      { href: "/rentas",      label: "Rentas",             icon: CalendarDays },
      { href: "/collections", label: "Cobranza",           icon: HandCoins },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/ingresos",    label: "Ingresos",                icon: TrendingUp },
      { href: "/egresos",     label: "Egresos",                 icon: TrendingDown },
      { href: "/nominas",     label: "Nóminas",                 icon: Users2 },
      { href: "/prediales",   label: "Prediales",               icon: Receipt },
      { href: "/inversiones", label: "Inversiones y Préstamos", icon: Landmark },
    ],
  },
  {
    label: "Planeación Financiera",
    items: [
      { href: "/presupuesto",             label: "Presupuesto",         icon: Target },
      { href: "/presupuesto/comparativo", label: "Real vs Presupuesto", icon: BarChart2 },
      { href: "/cierres/mensual",         label: "Cierres Mensuales",   icon: CalendarCheck },
      { href: "/cierres/anual",           label: "Cierres Anuales",     icon: Archive },
    ],
  },
  {
    label: "Reportes",
    items: [
      { href: "/reportes", label: "Reportes", icon: FileBarChart },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
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
        {GROUPS.map((group, gi) => (
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
    </aside>
  );
}
