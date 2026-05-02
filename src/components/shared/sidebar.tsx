"use client";

import {
  Building2,
  FileText,
  HandCoins,
  LayoutDashboard,
  PieChart,
  Receipt,
  Settings,
  Users,
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

const NAV: ReadonlyArray<NavItem> = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Inmuebles", icon: Building2 },
  { href: "/lessees", label: "Inquilinos", icon: Users },
  { href: "/contracts", label: "Contratos", icon: FileText },
  { href: "/collections", label: "Cobranza", icon: HandCoins },
  { href: "/prediales", label: "Prediales", icon: Receipt },
  { href: "/reportes", label: "Reportes", icon: PieChart },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <Image
          src="/logo/StrataSystem_logo.png"
          alt="Strata Systems"
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-lg object-cover"
          priority
        />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Rex</p>
          <p className="text-xs text-sidebar-foreground/60">by Strata Systems</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
