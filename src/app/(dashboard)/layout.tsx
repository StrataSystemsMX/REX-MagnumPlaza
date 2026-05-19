import type { ReactNode } from "react";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { tenantId } = await requireAuth();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar tenantName={tenant.name} />
        <main className="flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
