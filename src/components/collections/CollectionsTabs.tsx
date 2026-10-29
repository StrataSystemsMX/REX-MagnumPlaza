"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonthlyCollectionsView } from "@/components/collections/MonthlyCollectionsView";
import {
  OutstandingRentsTable,
  type EscalonChip,
} from "@/components/collections/OutstandingRentsTable";
import { PaymentsTable } from "@/components/collections/PaymentsTable";
import { RentasView } from "@/components/rentas/RentasView";
import { cn } from "@/shared/utils";
import type {
  MonthlyCollections,
  OutstandingRent,
  PaymentListItem,
} from "@/server/services/payments-queries";
import type { RentasTableData } from "@/server/services/rentas-queries";

export type CollectionsTopTab = "mes" | "por-cobrar" | "historial";
type MesMode = "tarjetas" | "kpis";

interface CollectionsTabsProps {
  outstanding: ReadonlyArray<OutstandingRent>;
  payments: ReadonlyArray<PaymentListItem>;
  monthly: MonthlyCollections;
  canDeletePayment: boolean;
  canEditPayment: boolean;
  rentasData: RentasTableData;
  activeTab: CollectionsTopTab;
  mesMode: MesMode;
  escalon: EscalonChip;
  activePlazaId: string | null;
}

export function CollectionsTabs({
  outstanding,
  payments,
  monthly,
  canDeletePayment,
  canEditPayment,
  rentasData,
  activeTab,
  mesMode,
  escalon,
  activePlazaId,
}: CollectionsTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) =>
        navigate({ tab: v as string, mode: null, escalon: null })
      }
      className="w-full"
    >
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList>
          <TabsTrigger value="mes">Este mes</TabsTrigger>
          <TabsTrigger value="por-cobrar">
            Por cobrar ({outstanding.length})
          </TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="mes" className="mt-4">
        {(() => {
          const modeToggle = (
            <SubToggle
              options={[
                { key: "tarjetas", label: "Tarjetas" },
                { key: "kpis", label: "KPIs operativos" },
              ]}
              active={mesMode}
              onChange={(k) => navigate({ tab: "mes", mode: k })}
            />
          );
          return mesMode === "kpis" ? (
            <RentasView tableData={rentasData} modeToggle={modeToggle} />
          ) : (
            <MonthlyCollectionsView
              data={monthly}
              activePlazaId={activePlazaId}
              modeToggle={modeToggle}
            />
          );
        })()}
      </TabsContent>

      <TabsContent value="por-cobrar" className="mt-4">
        <OutstandingRentsTable
          rents={outstanding}
          escalon={escalon}
          activePlazaId={activePlazaId}
        />
      </TabsContent>

      <TabsContent value="historial" className="mt-4">
        <PaymentsTable
          payments={payments}
          canDelete={canDeletePayment}
          canEdit={canEditPayment}
          activePlazaId={activePlazaId}
        />
      </TabsContent>
    </Tabs>
  );
}

interface SubToggleProps<T extends string> {
  options: ReadonlyArray<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
}

function SubToggle<T extends string>({ options, active, onChange }: SubToggleProps<T>) {
  return (
    <div className="inline-flex rounded-full border border-border bg-muted/30 p-1">
      {options.map((opt) => {
        const isActive = opt.key === active;
        return (
          <Button
            key={opt.key}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(opt.key)}
            className={cn(
              "rounded-full px-4 text-sm transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
