"use client";

import Link from "next/link";
import { FileText, Mail, MessageCircle, Phone, Receipt, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  communicationChannelLabel,
  contractStatusLabel,
  contractStatusVariant,
  contractTypeLabel,
  propertyStatusLabel,
  propertyTypeLabel,
  unitStatusLabel,
  unitStatusVariant,
} from "@/shared/i18n/enums";
import { isPlaza } from "@/shared/i18n/unit-label";
import type { UnitDetail } from "@/server/services/units-queries";
import { formatMXN } from "@/shared/format-currency";
import { formatDate } from "@/shared/format-date";

interface Props {
  unit: UnitDetail;
}

export function UnitDetailTabs({ unit }: Props) {
  const plaza = isPlaza(unit.property.type);
  const { contract } = unit;

  return (
    <Tabs defaultValue="summary" className="w-full">
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList variant="line">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="lessee">Inquilino</TabsTrigger>
          <TabsTrigger value="contract">Contrato</TabsTrigger>
          <TabsTrigger value="cadastral">Predial</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="summary" className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title={plaza ? "Local" : "Inmueble"}>
            {plaza ? (
              <>
                <Row label="Código">
                  <span className="font-mono font-medium">{unit.code}</span>
                </Row>
                {unit.name ? <Row label="Nombre">{unit.name}</Row> : null}
                <Row label="Estado">
                  <Badge variant={unitStatusVariant(unit.status)}>
                    {unitStatusLabel(unit.status)}
                  </Badge>
                </Row>
                {unit.area !== null ? <Row label="Área">{unit.area} m²</Row> : null}
                {unit.childUnits.length > 0 ? (
                  <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                    Agrupa {unit.childUnits.length} local
                    {unit.childUnits.length === 1 ? "" : "es"} más:{" "}
                    {unit.childUnits.map((c) => c.code).join(", ")}
                  </p>
                ) : null}
                {unit.parentUnit ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Agrupado bajo {unit.parentUnit.code}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <Row label="Tipo">{propertyTypeLabel(unit.property.type)}</Row>
                <Row label="Estado">{propertyStatusLabel(unit.property.status)}</Row>
                {unit.property.totalArea !== null ? (
                  <Row label="Área total">{unit.property.totalArea} m²</Row>
                ) : null}
              </>
            )}
            {unit.property.cadastralKey ? (
              <Row label="Clave catastral">
                <span className="font-mono">{unit.property.cadastralKey}</span>
              </Row>
            ) : null}
          </Card>

          <Card title="Propiedad">
            <p className="font-medium">{unit.property.name}</p>
            {unit.property.address ? (
              <p className="text-sm text-muted-foreground">{unit.property.address}</p>
            ) : null}
            <div className="mt-3 space-y-1">
              <Row label="Dueña">
                <span className="font-medium">{unit.property.ownerEntity.code}</span>
              </Row>
              <Row label="Administra">
                <span className="font-medium">{unit.property.managerEntity.code}</span>
              </Row>
            </div>
          </Card>

          <Card title={contract ? "Renta mensual" : "Renta estimada"}>
            <p className="text-2xl font-semibold tabular-nums">
              {contract
                ? formatMXN(contract.monthlyAmount, 2)
                : unit.estimatedRent !== null
                  ? formatMXN(unit.estimatedRent, 2)
                  : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {contract ? "según el contrato activo" : "sin contrato activo"}
            </p>
          </Card>

          {unit.notes || unit.property.notes ? (
            <Card title="Notas">
              {unit.notes ? <p className="whitespace-pre-wrap">{unit.notes}</p> : null}
              {unit.property.notes ? (
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {unit.property.notes}
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="lessee" className="mt-4">
        {contract ? (
          <div className="max-w-md space-y-3 rounded-lg border bg-card p-5">
            <div className="flex items-center gap-2">
              <UserRound className="size-4 text-muted-foreground" />
              <Link
                href={`/lessees/${contract.lessee.id}`}
                className="font-medium hover:underline"
              >
                {contract.lessee.legalName}
              </Link>
            </div>
            {contract.lessee.contactName ? (
              <Row label="Contacto">{contract.lessee.contactName}</Row>
            ) : null}
            {contract.lessee.rfc ? (
              <Row label="RFC">
                <span className="font-mono">{contract.lessee.rfc}</span>
              </Row>
            ) : null}
            <Row label="Canal preferido">
              {communicationChannelLabel(contract.lessee.preferredChannel)}
            </Row>
            {contract.lessee.phone ? (
              <div className="flex items-center gap-1.5 text-sm">
                <Phone className="size-3.5 text-muted-foreground" />
                {contract.lessee.phone}
              </div>
            ) : null}
            {contract.lessee.whatsapp ? (
              <div className="flex items-center gap-1.5 text-sm">
                <MessageCircle className="size-3.5 text-muted-foreground" />
                {contract.lessee.whatsapp}
              </div>
            ) : null}
            {contract.lessee.email ? (
              <div className="flex items-center gap-1.5 text-sm">
                <Mail className="size-3.5 text-muted-foreground" />
                {contract.lessee.email}
              </div>
            ) : null}
            <Link
              href={`/lessees/${contract.lessee.id}`}
              className="inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Ver historial completo (pagos, comunicaciones) →
            </Link>
          </div>
        ) : (
          <EmptyState
            icon={<UserRound className="size-8" />}
            message="Este espacio no tiene inquilino — está disponible para renta."
          />
        )}
      </TabsContent>

      <TabsContent value="contract" className="mt-4">
        {contract ? (
          <div className="max-w-md space-y-3 rounded-lg border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={contractStatusVariant(contract.status)}>
                {contractStatusLabel(contract.status)}
              </Badge>
              <Badge variant="secondary">{contractTypeLabel(contract.type)}</Badge>
            </div>
            <Row label="Renta mensual">
              <span className="font-medium tabular-nums">
                {formatMXN(contract.monthlyAmount, 2)}
              </span>
            </Row>
            <Row label="Depósito en garantía">
              {formatMXN(contract.guaranteeAmount, 2)}
            </Row>
            <Row label="Vigencia">
              <span className="tabular-nums">
                {formatDate(contract.startDate)} → {formatDate(contract.endDate)}
              </span>
            </Row>
            <Row label="Día de cobro">{contract.paymentDay}</Row>
            {contract.lateFeePercentage !== null ? (
              <Row label="Interés moratorio">{contract.lateFeePercentage}%</Row>
            ) : null}
            <Link
              href={`/contracts/${contract.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <FileText className="size-4" />
              Ver contrato completo
            </Link>
          </div>
        ) : (
          <EmptyState
            icon={<FileText className="size-8" />}
            message="Sin contrato activo."
            action={
              <Link
                href={`/contracts?nuevo=1&unitId=${unit.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Crear contrato →
              </Link>
            }
          />
        )}
      </TabsContent>

      <TabsContent value="cadastral" className="mt-4">
        {unit.cadastralPayments.length > 0 ? (
          <div className="max-w-md space-y-2 rounded-lg border bg-card p-5">
            {unit.cadastralPayments.map((cp) => (
              <div
                key={cp.id}
                className="flex items-center justify-between border-b py-2 text-sm last:border-b-0"
              >
                <span className="font-medium">{cp.year}</span>
                <span className="tabular-nums">
                  {cp.totalAmount !== null ? formatMXN(cp.totalAmount) : "—"}
                </span>
                <Badge variant={cp.isPaid ? "secondary" : "destructive"}>
                  {cp.isPaid ? "Pagado" : "Pendiente"}
                </Badge>
              </div>
            ))}
            <Link
              href={`/prediales?propertyId=${unit.property.id}`}
              className="inline-flex items-center gap-1.5 pt-2 text-sm font-medium hover:underline"
            >
              <Receipt className="size-4" />
              Ver historial completo de predial
            </Link>
          </div>
        ) : (
          <EmptyState
            icon={<Receipt className="size-8" />}
            message="Sin registros de predial para esta propiedad."
            action={
              <Link
                href={`/prediales?propertyId=${unit.property.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Ir a Prediales →
              </Link>
            }
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-5">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function EmptyState({
  icon,
  message,
  action,
}: {
  icon: React.ReactNode;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center text-muted-foreground">
      {icon}
      <p className="text-sm">{message}</p>
      {action}
    </div>
  );
}
