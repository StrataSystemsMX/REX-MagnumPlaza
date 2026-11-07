import { Suspense, type ReactNode } from "react";
import { MobileCaptureProvider } from "@/components/mobile/MobileCaptureProvider";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { requireAuth } from "@/server/auth/get-session";
import { hasPermission } from "@/server/auth/permissions";
import { getMobileOverdueRentCount } from "@/server/services/mobile-queries";

/**
 * Layout de Rex móvil: contenido con scroll de documento (Next restaura el
 * scroll a top al navegar) + tab bar inferior fija. Reemplaza Sidebar/Topbar
 * cuando `getIsMobileView()` es true.
 *
 * El perfil (Administrador vs Dueño) sale de los permisos: sin permisos de
 * captura se oculta el botón + y las acciones de escritura.
 */
export async function MobileShell({ children }: { children: ReactNode }) {
  const { dbUser } = await requireAuth();
  const [overdueCount, canRegisterPayment, canCreateExpense, canCreateMaintenance] =
    await Promise.all([
      getMobileOverdueRentCount(),
      hasPermission(dbUser.id, "payment.register"),
      hasPermission(dbUser.id, "expense.create"),
      hasPermission(dbUser.id, "maintenance.create"),
    ]);

  return (
    <MobileCaptureProvider
      permissions={{ canRegisterPayment, canCreateExpense, canCreateMaintenance }}
    >
      <div className="min-h-dvh bg-background pt-[env(safe-area-inset-top)] pb-[calc(110px+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <Suspense>
        <MobileTabBar overdueCount={overdueCount} />
      </Suspense>
    </MobileCaptureProvider>
  );
}
