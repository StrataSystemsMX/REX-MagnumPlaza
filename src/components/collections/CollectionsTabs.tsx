"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MonthlyRentCalendar,
  type RentCalendarItem,
} from "@/components/collections/MonthlyRentCalendar";
import { MonthlyCollectionsView } from "@/components/collections/MonthlyCollectionsView";
import { OutstandingRentsTable } from "@/components/collections/OutstandingRentsTable";
import { PaymentsTable } from "@/components/collections/PaymentsTable";
import { RentasView } from "@/components/rentas/RentasView";
import type {
  MonthlyCollections,
  OutstandingRent,
  PaymentListItem,
} from "@/lib/services/payments-queries";
import type { RentasTableData } from "@/lib/services/rentas-queries";

interface CollectionsTabsProps {
  outstanding: ReadonlyArray<OutstandingRent>;
  payments: ReadonlyArray<PaymentListItem>;
  calendarRents: ReadonlyArray<RentCalendarItem>;
  monthly: MonthlyCollections;
  properties: ReadonlyArray<{ id: string; name: string }>;
  canDeletePayment: boolean;
  rentasData: RentasTableData;
  defaultTab?: string;
}

export function CollectionsTabs({
  outstanding,
  payments,
  calendarRents,
  monthly,
  properties,
  canDeletePayment,
  rentasData,
  defaultTab = "monthly",
}: CollectionsTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList>
          <TabsTrigger value="monthly">Cobros del mes</TabsTrigger>
          <TabsTrigger value="outstanding">
            Por cobrar ({outstanding.length})
          </TabsTrigger>
          <TabsTrigger value="payments">
            Pagos recibidos ({payments.length})
          </TabsTrigger>
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
          <TabsTrigger value="rentas">Control operativo</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="monthly" className="mt-4">
        <MonthlyCollectionsView data={monthly} />
      </TabsContent>

      <TabsContent value="outstanding" className="mt-4">
        <OutstandingRentsTable rents={outstanding} properties={properties} />
      </TabsContent>

      <TabsContent value="payments" className="mt-4">
        <PaymentsTable payments={payments} canDelete={canDeletePayment} />
      </TabsContent>

      <TabsContent value="calendar" className="mt-4">
        <MonthlyRentCalendar rents={calendarRents} />
      </TabsContent>

      <TabsContent value="rentas" className="mt-4">
        <RentasView tableData={rentasData} />
      </TabsContent>
    </Tabs>
  );
}
