import { RentasView } from "@/components/rentas/RentasView";
import { getRentasTableData } from "@/lib/services/rentas-queries";

function parsePeriod(periodo?: string): Date {
  if (periodo && /^\d{4}-\d{2}$/.test(periodo)) {
    const [year, month] = periodo.split("-").map(Number);
    return new Date(Date.UTC(year!, month! - 1, 1));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export default async function RentasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  const period = parsePeriod(periodo);
  const tableData = await getRentasTableData(period);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rentas</h1>
        <p className="text-sm text-muted-foreground">
          Control operativo mensual — estado de locales, cobranza y adeudos.
        </p>
      </div>
      <RentasView tableData={tableData} />
    </div>
  );
}
