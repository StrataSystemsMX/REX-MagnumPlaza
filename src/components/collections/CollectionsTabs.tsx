"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MonthlyRentCalendar,
  type RentCalendarItem,
} from "@/components/collections/MonthlyRentCalendar";
import { OutstandingRentsTable } from "@/components/collections/OutstandingRentsTable";
import { PaymentsTable } from "@/components/collections/PaymentsTable";
import type {
  OutstandingRent,
  PaymentListItem,
} from "@/lib/services/payments-queries";

interface CollectionsTabsProps {
  outstanding: ReadonlyArray<OutstandingRent>;
  payments: ReadonlyArray<PaymentListItem>;
  calendarRents: ReadonlyArray<RentCalendarItem>;
  properties: ReadonlyArray<{ id: string; name: string }>;
  canDeletePayment: boolean;
}

export function CollectionsTabs({
  outstanding,
  payments,
  calendarRents,
  properties,
  canDeletePayment,
}: CollectionsTabsProps) {
  return (
    <Tabs defaultValue="outstanding" className="w-full">
      <TabsList>
        <TabsTrigger value="outstanding">
          Por cobrar ({outstanding.length})
        </TabsTrigger>
        <TabsTrigger value="payments">
          Pagos recibidos ({payments.length})
        </TabsTrigger>
        <TabsTrigger value="calendar">Calendario</TabsTrigger>
      </TabsList>

      <TabsContent value="outstanding" className="mt-4">
        <OutstandingRentsTable rents={outstanding} properties={properties} />
      </TabsContent>

      <TabsContent value="payments" className="mt-4">
        <PaymentsTable payments={payments} canDelete={canDeletePayment} />
      </TabsContent>

      <TabsContent value="calendar" className="mt-4">
        <MonthlyRentCalendar rents={calendarRents} />
      </TabsContent>
    </Tabs>
  );
}
