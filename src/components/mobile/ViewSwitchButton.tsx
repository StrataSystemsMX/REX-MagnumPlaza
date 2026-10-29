"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { actionSetViewPreference } from "@/server/mobile/view-actions";
import { cn } from "@/shared/utils";

/** Alterna entre Rex móvil y la versión de escritorio (cookie `rex_view`). */
export function ViewSwitchButton({
  to,
  className,
}: {
  to: "mobile" | "desktop";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const Icon = to === "mobile" ? Smartphone : Monitor;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await actionSetViewPreference(to);
            router.refresh();
          } catch (e) {
            console.error("[mobile] view switch failed", e);
            toast.error("No se pudo cambiar la vista.");
          }
        })
      }
      className={cn("inline-flex items-center gap-1.5 disabled:opacity-60", className)}
    >
      <Icon className="size-4" />
      {to === "mobile" ? "Versión móvil" : "Ver versión de escritorio"}
    </button>
  );
}
