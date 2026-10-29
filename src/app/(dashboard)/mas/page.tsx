import { redirect } from "next/navigation";
import { MobileMore } from "@/components/mobile/MobileMore";
import { requireAuth } from "@/server/auth/get-session";
import { getUserRoleCodes } from "@/server/auth/permissions";
import { roleCodeLabel } from "@/shared/i18n/enums";
import { getIsMobileView } from "@/server/mobile/viewport";
import { prisma } from "@/server/prisma/client";
import { getMobileMoreCounts } from "@/server/services/mobile-queries";

/** Tab "Más" de Rex móvil. En escritorio la navegación vive en el sidebar. */
export default async function MorePage() {
  if (!(await getIsMobileView())) redirect("/");

  const { dbUser } = await requireAuth();
  const [counts, roles, tenant] = await Promise.all([
    getMobileMoreCounts(),
    getUserRoleCodes(dbUser.id),
    prisma.tenant.findUnique({ where: { id: dbUser.tenantId }, select: { name: true } }),
  ]);

  return (
    <MobileMore
      userName={dbUser.name}
      roleLabel={roles[0] ? roleCodeLabel(roles[0]) : "Usuario"}
      tenantName={tenant?.name ?? ""}
      counts={counts}
    />
  );
}
