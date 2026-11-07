// Navegación de Rex móvil. Las pantallas de detalle (inquilino, plaza) se
// apilan sobre el tab desde el que se abrieron; el origen viaja en `?from=`
// para pintar el "‹ {pantalla anterior}" y mantener activo el tab correcto.

export type MobileTab = "inicio" | "cobranza" | "propiedades" | "mas";

export type MobileOrigin =
  | "inicio"
  | "cobranza"
  | "morosidad"
  | "propiedades"
  | "inquilinos"
  | "contratos"
  | "mantenimientos"
  | `plaza-${string}`;

export function withOrigin(href: string, from: MobileOrigin): string {
  return `${href}${href.includes("?") ? "&" : "?"}from=${encodeURIComponent(from)}`;
}

export function backTarget(
  from: string | null | undefined,
  fallback: { href: string; label: string },
): { href: string; label: string } {
  if (!from) return fallback;
  if (from.startsWith("plaza-")) return { href: `/plazas/${from.slice(6)}`, label: "Propiedad" };
  switch (from) {
    case "inicio":
      return { href: "/", label: "Inicio" };
    case "cobranza":
      return { href: "/collections", label: "Cobranza" };
    case "morosidad":
      return { href: "/collections?seg=morosidad", label: "Morosidad" };
    case "propiedades":
      return { href: "/plazas", label: "Propiedades" };
    case "inquilinos":
      return { href: "/lessees", label: "Inquilinos" };
    case "contratos":
      return { href: "/contracts", label: "Contratos" };
    case "mantenimientos":
      return { href: "/mantenimientos", label: "Mantenimientos" };
    default:
      return fallback;
  }
}

export function activeTab(pathname: string, from: string | null): MobileTab {
  if (from) {
    if (from === "inicio") return "inicio";
    if (from === "cobranza" || from === "morosidad") return "cobranza";
    if (from === "propiedades" || from.startsWith("plaza-")) return "propiedades";
    return "mas";
  }
  if (pathname === "/") return "inicio";
  if (pathname.startsWith("/collections")) return "cobranza";
  if (
    pathname.startsWith("/plazas") ||
    pathname.startsWith("/inmuebles") ||
    pathname.startsWith("/properties")
  ) {
    return "propiedades";
  }
  return "mas";
}
