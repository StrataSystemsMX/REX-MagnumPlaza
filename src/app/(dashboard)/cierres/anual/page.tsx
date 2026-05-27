import { requireAuth } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma/client";
import { getAnnualClosingBundle } from "@/lib/services/cierres-queries";
import { CierreAnualView } from "@/components/cierres/CierreAnualView";

interface SearchParams {
  year?: string;
  month?: string;
}

export default async function CierresAnualPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { tenantId } = await requireAuth();

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const year = sp.year ? Number(sp.year) || currentYear : currentYear;
  const monthRaw = sp.month ? Number(sp.month) : null;
  const initialMonth =
    monthRaw !== null && Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : null;

  // Años con movimiento — para el selector. Usamos años de Payment y Expense.
  const [oldestPayment, oldestExpense] = await Promise.all([
    prisma.payment.findFirst({
      where: { tenantId },
      orderBy: { paymentDate: "asc" },
      select: { paymentDate: true },
    }),
    prisma.expense.findFirst({
      where: { tenantId },
      orderBy: { expenseDate: "asc" },
      select: { expenseDate: true },
    }),
  ]);

  const earliestYear = Math.min(
    oldestPayment?.paymentDate.getUTCFullYear() ?? currentYear,
    oldestExpense?.expenseDate.getUTCFullYear() ?? currentYear,
    year,
  );

  const availableYears: number[] = [];
  for (let y = currentYear + 1; y >= earliestYear; y--) {
    availableYears.push(y);
  }

  const data = await getAnnualClosingBundle(tenantId, year);

  return (
    <CierreAnualView
      data={data}
      availableYears={availableYears}
      initialMonth={initialMonth}
    />
  );
}
