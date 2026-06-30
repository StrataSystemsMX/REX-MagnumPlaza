import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { rentStatusLabel } from "@/lib/i18n/enums";
import type { RentStatus } from "@/generated/prisma/enums";
import {
  DocFooter,
  DocHeader,
  MultilineText,
  sharedStyles,
  type DocumentBillingEntity,
  type DocumentTenantInfo,
} from "./shared";
import { capitalizeFirst } from "@/lib/utils";
import { formatMXN } from "@/lib/format-currency";
import { formatPeriodLong } from "@/lib/format-date";

// day+month:"long"+year → no mapea a formatDate (que usa month short). Inline.
const DATE = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export interface AccountStatementContractBlock {
  contractId: string;
  propertyName: string;
  unitCode: string;
  unitName: string | null;
  monthlyAmount: string;
  rents: Array<{
    period: Date;
    amountDue: string;
    amountPaid: string;
    amountWaived: string;
    status: string;
  }>;
}

export interface AccountStatementProps {
  tenant: DocumentTenantInfo;
  billingEntity: DocumentBillingEntity;
  lessee: {
    legalName: string;
    contactName: string | null;
    rfc: string | null;
  };
  asOfDate: Date;
  /** Plazo cubierto por el estado de cuenta (ej. "Enero de 2026 – Junio de 2026"). */
  periodLabel?: string;
  contracts: AccountStatementContractBlock[];
  totals: {
    totalDue: string;
    totalPaid: string;
    totalLateFee: string;
    balance: string;
  };
  contactInfo: string;
  texts: {
    title: string;
    intro: string;
    closing: string;
  };
}

const cell = {
  period: { width: "32%" },
  due: { width: "18%", textAlign: "right" as const },
  paid: { width: "18%", textAlign: "right" as const },
  bal: { width: "18%", textAlign: "right" as const },
  status: { width: "14%", textAlign: "right" as const },
};

export function AccountStatementPdf(props: AccountStatementProps) {
  return (
    <Document
      title={`Estado de cuenta — ${props.lessee.legalName}`}
      author={props.billingEntity.legalName}
    >
      <Page size="A4" style={sharedStyles.page}>
        <DocHeader tenant={props.tenant} billingEntity={props.billingEntity} />

        <Text style={sharedStyles.title}>{props.texts.title}</Text>
        <Text style={sharedStyles.subtitle}>
          Generado el {capitalizeFirst(DATE.format(props.asOfDate))}
          {props.periodLabel ? ` · Periodo: ${props.periodLabel}` : ""}
        </Text>

        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionLabel}>Inquilino</Text>
          <Text style={[sharedStyles.sectionValue, sharedStyles.bold]}>
            {props.lessee.legalName}
          </Text>
          {props.lessee.contactName ? (
            <Text style={sharedStyles.headerSmall}>
              Contacto: {props.lessee.contactName}
            </Text>
          ) : null}
          {props.lessee.rfc ? (
            <Text style={sharedStyles.headerSmall}>RFC: {props.lessee.rfc}</Text>
          ) : null}
        </View>

        <MultilineText text={props.texts.intro} />

        {props.contracts.map((c) => (
          <View key={c.contractId} style={{ marginTop: 14 }} wrap={false}>
            <Text style={[sharedStyles.bold, { fontSize: 11 }]}>
              {c.propertyName} — {c.unitCode}
              {c.unitName ? ` (${c.unitName})` : ""}
            </Text>
            <Text style={sharedStyles.headerSmall}>
              Renta mensual: {formatMXN(c.monthlyAmount, 2)} · Contrato{" "}
              {c.contractId.slice(-8)}
            </Text>

            <View style={[sharedStyles.tableHeaderRow, { marginTop: 6 }]}>
              <Text style={cell.period}>Periodo</Text>
              <Text style={cell.due}>Cargo</Text>
              <Text style={cell.paid}>Pagado</Text>
              <Text style={cell.bal}>Saldo</Text>
              <Text style={cell.status}>Estado</Text>
            </View>
            {c.rents.map((r, idx) => {
              const balance =
                Number(r.amountDue) - Number(r.amountPaid) - Number(r.amountWaived);
              return (
                <View key={idx} style={sharedStyles.tableRow}>
                  <Text style={cell.period}>
                    {formatPeriodLong(r.period)}
                  </Text>
                  <Text style={cell.due}>
                    {formatMXN(r.amountDue, 2)}
                  </Text>
                  <Text style={cell.paid}>
                    {formatMXN(r.amountPaid, 2)}
                  </Text>
                  <Text style={cell.bal}>{formatMXN(balance, 2)}</Text>
                  <Text style={cell.status}>
                    {rentStatusLabel(r.status as RentStatus)}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}

        <View style={[sharedStyles.highlightBox, { marginTop: 18 }]}>
          <View style={{ flexDirection: "row" }}>
            <Text style={[{ width: "60%" }, sharedStyles.bold]}>
              Cargado total
            </Text>
            <Text style={{ width: "40%", textAlign: "right" }}>
              {formatMXN(props.totals.totalDue, 2)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", marginTop: 2 }}>
            <Text style={[{ width: "60%" }, sharedStyles.bold]}>
              Pagado total
            </Text>
            <Text style={{ width: "40%", textAlign: "right" }}>
              {formatMXN(props.totals.totalPaid, 2)}
            </Text>
          </View>
          {Number(props.totals.totalLateFee) > 0 ? (
            <View style={{ flexDirection: "row", marginTop: 2 }}>
              <Text style={[{ width: "60%" }, sharedStyles.bold]}>
                Interés moratorio acumulado
              </Text>
              <Text style={{ width: "40%", textAlign: "right" }}>
                {formatMXN(props.totals.totalLateFee, 2)}
              </Text>
            </View>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              marginTop: 4,
              paddingTop: 4,
              borderTopWidth: 0.5,
              borderTopColor: "#999",
            }}
          >
            <Text style={[{ width: "60%", fontSize: 11 }, sharedStyles.bold]}>
              Saldo total adeudado
            </Text>
            <Text
              style={{
                width: "40%",
                textAlign: "right",
                fontSize: 12,
                fontFamily: "Helvetica-Bold",
              }}
            >
              {formatMXN(props.totals.balance, 2)}
            </Text>
          </View>
        </View>

        <Text style={sharedStyles.legalNote}>{props.texts.closing}</Text>

        <DocFooter contactInfo={props.contactInfo} />
      </Page>
    </Document>
  );
}
