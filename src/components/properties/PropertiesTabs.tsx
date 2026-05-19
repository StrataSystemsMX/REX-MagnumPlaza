"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "plazas", label: "Plazas y Locales" },
  { key: "inmuebles", label: "Inmuebles Individuales" },
] as const;

export type PropertiesTab = (typeof TABS)[number]["key"];

interface Props {
  activeTab: PropertiesTab;
}

export function PropertiesTabs({ activeTab }: Props) {
  const router = useRouter();

  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => router.push(`/plazas?tab=${t.key}`)}
            className={cn(
              "pb-3 text-sm font-medium transition-colors border-b-2",
              activeTab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
