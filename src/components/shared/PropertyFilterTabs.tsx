"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Property {
  id: string;
  name: string;
}

interface PropertyFilterTabsProps {
  properties: ReadonlyArray<Property>;
  activePlazaId: string | null;
}

export function PropertyFilterTabs({ properties, activePlazaId }: PropertyFilterTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("plaza");
    else params.set("plaza", value);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <Tabs value={activePlazaId ?? "all"} onValueChange={navigate}>
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList variant="line">
          <TabsTrigger value="all">Todas</TabsTrigger>
          {properties.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
