import { GlobalUnitsTable } from "@/components/properties/GlobalUnitsTable";
import { getUnitsGrouped } from "@/lib/services/properties-queries";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export default async function UnitsPage() {
  const groups = await getUnitsGrouped({ propertyTypeIn: ["PLAZA_COMERCIAL"] });

  let total = 0;
  let rented = 0;
  let available = 0;
  let monthlyIncome = 0;
  for (const g of groups) {
    total += g.units.length;
    for (const u of g.units) {
      if (u.status === "RENTADA") rented += 1;
      if (u.status === "DISPONIBLE") available += 1;
      const contract = u.contracts[0];
      if (contract) monthlyIncome += Number(contract.monthlyAmount);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Locales</h1>
        <p className="text-sm text-muted-foreground">
          Locales de las plazas comerciales. {total} local
          {total === 1 ? "" : "es"} · {rented} rentado
          {rented === 1 ? "" : "s"} · {available} libre
          {available === 1 ? "" : "s"}
          {monthlyIncome > 0 ? (
            <>
              {" "}
              · <span className="font-medium text-foreground">
                {MXN.format(monthlyIncome)}
              </span>{" "}
              ingreso mensual
            </>
          ) : null}
          .
        </p>
      </div>
      <GlobalUnitsTable groups={groups} />
    </div>
  );
}
