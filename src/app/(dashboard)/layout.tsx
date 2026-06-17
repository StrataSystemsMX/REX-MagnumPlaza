import type { ReactNode } from "react";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { requireAuth } from "@/lib/auth/get-session";
import { canAccessAudit } from "@/lib/auth/permissions";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { dbUser } = await requireAuth();
  const canViewHistory = await canAccessAudit(dbUser.id);
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar canViewHistory={canViewHistory} />
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
