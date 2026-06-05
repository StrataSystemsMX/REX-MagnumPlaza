import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  DocFooter,
  DocHeader,
  MultilineText,
  sharedStyles,
  type DocumentBillingEntity,
  type DocumentTenantInfo,
} from "./shared";
import type { ReminderLevel, ReminderTextConfig } from "@/lib/pdf/template-config";
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

export interface OverdueReminderRent {
  period: Date;
  amountDue: string;
  amountPaid: string;
  daysOverdue: number;
  status: string;
}

export interface OverdueReminderProps {
  level: ReminderLevel;
  tenant: DocumentTenantInfo;
  billingEntity: DocumentBillingEntity;
  lessee: {
    legalName: string;
    contactName: string | null;
    rfc: string | null;
  };
  unitLabel: string;
  /** Rent que disparó el aviso (más antiguo) — primero en la tabla. */
  primaryRent: OverdueReminderRent;
  /** Otros Rents pendientes del mismo contrato/lessee. */
  additionalRents: OverdueReminderRent[];
  totals: {
    balance: string;
  };
  contactInfo: string;
  asOfDate: Date;
  /** Texto pre-resuelto (ya con tokens reemplazados). */
  texts: ReminderTextConfig;
}

const cell = {
  period: { width: "30%" },
  due: { width: "20%", textAlign: "right" as const },
  paid: { width: "20%", textAlign: "right" as const },
  bal: { width: "20%", textAlign: "right" as const },
  days: { width: "10%", textAlign: "right" as const },
};

export function OverdueReminderPdf(props: OverdueReminderProps) {
  const accentByLevel: Record<ReminderLevel, string> = {
    "1M": "#888888",
    "2M": "#cc7700",
    "3M": "#cc1f1f",
  };
  const accent = accentByLevel[props.level];

  const allRents = [props.primaryRent, ...props.additionalRents];

  return (
    <Document
      title={`${props.texts.title} — ${props.lessee.legalName}`}
      author={props.billingEntity.legalName}
    >
      <Page size="A4" style={sharedStyles.page}>
        <DocHeader tenant={props.tenant} billingEntity={props.billingEntity} />

        <Text
          style={[
            sharedStyles.title,
            { color: accent },
          ]}
        >
          {props.texts.title}
        </Text>
        <Text style={sharedStyles.subtitle}>
          Hermosillo, Sonora · {capitalizeFirst(DATE.format(props.asOfDate))}
        </Text>

        <Text style={[sharedStyles.paragraph, sharedStyles.bold]}>
          {props.texts.greeting}
        </Text>

        <MultilineText text={props.texts.body} />

        <View
          style={[
            sharedStyles.highlightBox,
            { borderLeftColor: accent },
          ]}
        >
          <Text style={[sharedStyles.bold, { fontSize: 11 }]}>
            Detalle del adeudo
          </Text>
          <Text style={sharedStyles.headerSmall}>
            Unidad: {props.unitLabel}
          </Text>
          <View style={[sharedStyles.tableHeaderRow, { marginTop: 6 }]}>
            <Text style={cell.period}>Periodo</Text>
            <Text style={cell.due}>Cargo</Text>
            <Text style={cell.paid}>Pagado</Text>
            <Text style={cell.bal}>Saldo</Text>
            <Text style={cell.days}>Días</Text>
          </View>
          {allRents.map((r, idx) => {
            const balance = Number(r.amountDue) - Number(r.amountPaid);
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
                <Text style={cell.days}>{r.daysOverdue}d</Text>
              </View>
            );
          })}
          <View
            style={{
              flexDirection: "row",
              marginTop: 6,
              paddingTop: 4,
              borderTopWidth: 0.5,
              borderTopColor: "#999",
            }}
          >
            <Text style={[{ width: "70%" }, sharedStyles.bold]}>
              Saldo total adeudado
            </Text>
            <Text
              style={{
                width: "30%",
                textAlign: "right",
                fontSize: 11,
                fontFamily: "Helvetica-Bold",
                color: accent,
              }}
            >
              {formatMXN(props.totals.balance, 2)}
            </Text>
          </View>
        </View>

        <Text style={sharedStyles.legalNote}>{props.texts.legalNote}</Text>

        <View style={{ marginTop: 18 }}>
          <MultilineText text={props.texts.closing} />
        </View>

        <DocFooter contactInfo={props.contactInfo} />
      </Page>
    </Document>
  );
}
