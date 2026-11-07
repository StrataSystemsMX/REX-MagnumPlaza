import type { ReactNode } from "react";
import { MobileShell } from "@/components/mobile/MobileShell";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { requireAuth } from "@/server/auth/get-session";
import { canAccessAudit } from "@/server/auth/permissions";
import { getIsMobileView, isPhoneUserAgent } from "@/server/mobile/viewport";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { dbUser } = await requireAuth();

  // Rex móvil: en teléfonos se reemplaza Sidebar/Topbar por la tab bar inferior.
  if (await getIsMobileView()) {
    return <MobileShell>{children}</MobileShell>;
  }

  const [canViewHistory, isPhone] = await Promise.all([
    canAccessAudit(dbUser.id),
    isPhoneUserAgent(),
  ]);
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* En un teléfono que eligió escritorio, ofrecemos regresar a móvil. */}
        <Topbar canViewHistory={canViewHistory} canSwitchToMobile={isPhone} />
        {/* scrollbar-gutter:stable reserva el ancho de la barra de scroll para
            que el contenido no se desplace al aparecer/desaparecer (p. ej. al
            filtrar una tabla y cambiar el número de filas). */}
        <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable] bg-muted/20 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
