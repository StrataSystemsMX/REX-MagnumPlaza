import {
  Archive,
  Banknote,
  BarChart2,
  Building2,
  CalendarCheck,
  FileBarChart,
  FileText,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Receipt,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  UserSquare2,
  Users,
  Users2,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operación Inmobiliaria",
    items: [
      { href: "/plazas",       label: "Propiedades", icon: Building2 },
      { href: "/lessees",     label: "Inquilinos", icon: Users },
      { href: "/contracts",   label: "Contratos",  icon: FileText },
      { href: "/collections",  label: "Cobranza",   icon: HandCoins },
      { href: "/fianzas",         label: "Fianzas",        icon: ShieldAlert },
      { href: "/mantenimientos", label: "Mantenimientos", icon: Wrench },
      { href: "/promotores",     label: "Promotores",     icon: UserSquare2 },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/ingresos",    label: "Ingresos",                icon: TrendingUp },
      { href: "/egresos",     label: "Egresos",                 icon: TrendingDown },
      { href: "/nominas",     label: "Nóminas",                 icon: Users2 },
      { href: "/prediales",   label: "Prediales",               icon: Receipt },
      { href: "/inversiones", label: "Inversiones",              icon: Landmark },
      { href: "/prestamos",   label: "Préstamos",                icon: Banknote },
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
