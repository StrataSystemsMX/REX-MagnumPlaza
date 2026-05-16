import { UserButton } from "@clerk/nextjs";
import { getActiveLegalEntityId } from "@/lib/auth/active-legal-entity";
import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { LegalEntitySwitcher } from "./legal-entity-switcher";
import { MobileSidebar } from "./mobile-sidebar";

interface TopbarProps {
  tenantName: string;
}

export async function Topbar({ tenantName }: TopbarProps) {
  const { tenantId } = await requireAuth();
  const [entities, activeEntityId] = await Promise.all([
    prisma.legalEntity.findMany({
      where: { tenantId, isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, legalName: true },
    }),
    getActiveLegalEntityId(),
  ]);

  return (
    <header className="flex h-16 items-center justify-between gap-2 border-b bg-card px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar />
        <LegalEntitySwitcher
          tenantName={tenantName}
          entities={entities}
          activeEntityId={activeEntityId}
        />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
      </div>
    </header>
  );
}
