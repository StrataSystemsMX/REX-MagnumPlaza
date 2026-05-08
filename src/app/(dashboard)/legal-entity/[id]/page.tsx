import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/get-session";
import { getUserRoleCodes } from "@/lib/auth/permissions";
import { propertyTypeLabel } from "@/lib/i18n/enums";
import { getLegalEntityMetrics } from "@/lib/services/legal-entity-queries";
import type { PropertyType } from "@/generated/prisma/enums";
import { capitalizeFirst } from "@/lib/utils";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}

export default async function LegalEntityPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { year: yearParam } = await searchParams;

  const { dbUser } = await requireAuth();
  const roles = await getUserRoleCodes(dbUser.id);

  // Solo MASTER y ACCOUNTANT pueden ver finanzas por LegalEntity (CLAUDE.md §2).
  const canSee =
    roles.includes("MASTER") || roles.includes("ACCOUNTANT") || roles.length === 0;
  if (!canSee) redirect("/");

  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
  const data = await getLegalEntityMetrics(dbUser.tenantId, id, year);
  if (!data) notFound();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/" />}
          >
            <ArrowLeft className="size-4" />
            Volver al dashboard
          </Button>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {data.code} — {data.legalName}
          </h1>
          {data.rfc ? (
            <p className="text-sm text-muted-foreground">
              RFC {data.rfc}
              {data.address ? ` · ${data.address}` : ""}
            </p>
          ) : null}
        </div>
        <Badge variant="outline">Ejercicio {data.year}</Badge>
      </header>

      {/* Resumen anual */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Ingresos del año</CardDescription>
            <CardTitle className="text-2xl">{MXN.format(Number(data.totalIncome))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Egresos del año</CardDescription>
            <CardTitle className="text-2xl">{MXN.format(Number(data.totalExpenses))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Utilidad del año</CardDescription>
            <CardTitle
              className={
                Number(data.totalProfit) > 0
                  ? "text-2xl text-emerald-600"
                  : Number(data.totalProfit) < 0
                    ? "text-2xl text-rose-600"
                    : "text-2xl"
              }
            >
              {MXN.format(Number(data.totalProfit))}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabla mensual estilo "Cierre" */}
      <Card>
        <CardHeader>
          <CardTitle>Cierre mensual</CardTitle>
          <CardDescription>Ingresos, egresos y utilidad por mes</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                {MONTH_NAMES.map((n) => (
                  <TableHead key={n} className="text-right">
                    {n}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Ingresos</TableCell>
                {data.monthlyIncome.map((v, i) => (
                  <TableCell key={i} className="text-right tabular-nums">
                    {Number(v) === 0 ? "—" : MXN.format(Number(v))}
                  </TableCell>
                ))}
                <TableCell className="text-right font-semibold tabular-nums">
                  {MXN.format(Number(data.totalIncome))}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Egresos</TableCell>
                {data.monthlyExpenses.map((v, i) => (
                  <TableCell key={i} className="text-right tabular-nums">
                    {Number(v) === 0 ? "—" : MXN.format(Number(v))}
                  </TableCell>
                ))}
                <TableCell className="text-right font-semibold tabular-nums">
                  {MXN.format(Number(data.totalExpenses))}
                </TableCell>
              </TableRow>
              <TableRow className="bg-muted/30">
                <TableCell className="font-medium">Utilidad</TableCell>
                {data.monthlyProfit.map((v, i) => {
                  const n = Number(v);
                  return (
                    <TableCell
                      key={i}
                      className={`text-right tabular-nums ${
                        n > 0 ? "text-emerald-600" : n < 0 ? "text-rose-600" : ""
                      }`}
                    >
                      {n === 0 ? "—" : MXN.format(n)}
                    </TableCell>
                  );
                })}
                <TableCell
                  className={`text-right font-semibold tabular-nums ${
                    Number(data.totalProfit) > 0
                      ? "text-emerald-600"
                      : Number(data.totalProfit) < 0
                        ? "text-rose-600"
                        : ""
                  }`}
                >
                  {MXN.format(Number(data.totalProfit))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Egresos por categoría */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Egresos por categoría</CardTitle>
            <CardDescription>Acumulado del año</CardDescription>
          </CardHeader>
          <CardContent>
            {data.expensesByCategory.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aún no hay egresos registrados.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expensesByCategory.map((row) => (
                    <TableRow key={row.categoryName}>
                      <TableCell>{row.categoryName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {MXN.format(Number(row.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inmuebles asociados</CardTitle>
            <CardDescription>
              Como dueño y como administrador
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inmueble</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Rol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data.ownedProperties, ...data.managedProperties].map((p) => (
                  <TableRow key={`${p.id}-${p.isOwner ? "o" : "m"}`}>
                    <TableCell>
                      <Link
                        href={`/properties/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {propertyTypeLabel(p.type as PropertyType)}
                    </TableCell>
                    <TableCell>
                      {p.isOwner ? (
                        <Badge variant="default">Dueño</Badge>
                      ) : (
                        <Badge variant="secondary">Administrador</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data.ownedProperties.length === 0 && data.managedProperties.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      No hay inmuebles asociados.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Egresos recientes */}
      <Card>
        <CardHeader>
          <CardTitle>Egresos recientes</CardTitle>
          <CardDescription>Últimos 20 movimientos del año</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentExpenses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin egresos registrados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentExpenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{capitalizeFirst(DATE.format(e.expenseDate))}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.category}</Badge>
                    </TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.vendor ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {MXN.format(Number(e.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
