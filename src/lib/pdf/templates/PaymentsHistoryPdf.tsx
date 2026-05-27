import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  DocFooter,
  DocHeader,
  sharedStyles,
} from "./shared";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("es-MX", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

const PERIOD = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 50,
    paddingHorizontal: 28,
    fontFamily: "Helvetica",
    fontSize: 7,
    color: "#1a1a1a",
    lineHeight: 1.3,
  },
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#444",
    backgroundColor: "#f3f3f3",
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    borderBottomWidth: 0.3,
    borderBottomColor: "#ddd",
    fontSize: 7,
  },
  tableRowAlt: {
    backgroundColor: "#fafafa",
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderTopWidth: 1,
    borderTopColor: "#444",
    backgroundColor: "#eaeaea",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
  },
  cFecha:      { width: "10%", textAlign: "left" },
  cInquilino:  { width: "22%", textAlign: "left" },
  cInmueble:   { width: "28%", textAlign: "left" },
  cPeriodo:    { width: "8%",  textAlign: "center" },
  cMetodo:     { width: "12%", textAlign: "center" },
  cReferencia: { width: "10%", textAlign: "left" },
  cMonto:      { width: "10%", textAlign: "right" },
  cInmuebleSub: { fontSize: 6, color: "#777", marginTop: 1 },
});

export interface PaymentHistoryRow {
  paymentDate: Date;
  legalName: string;
  propertyName: string;
  unitCode: string | null;
  unitName: string | null;
  isPlaza: boolean;
  period: Date;
  methodLabel: string;
  reference: string | null;
  amount: string;
}

export interface PaymentsHistoryPdfProps {
  contextName: string;
  contactInfo: string;
  generatedAt: Date;
  payments: PaymentHistoryRow[];
  totalAmount: string;
  filters: {
    from: string | null;
    to: string | null;
    method: string | null;
    search: string | null;
  };
}

export function PaymentsHistoryPdf(props: PaymentsHistoryPdfProps) {
  const { payments, totalAmount, filters } = props;

  const dateRange =
    filters.from && filters.to
      ? `${filters.from} – ${filters.to}`
      : filters.from
        ? `Desde ${filters.from}`
        : filters.to
          ? `Hasta ${filters.to}`
          : null;

  const extraParts: string[] = [];
  if (filters.method) extraParts.push(filters.method);
  if (filters.search) extraParts.push(`"${filters.search}"`);

  const subtitleParts = [
    dateRange,
    ...extraParts,
    `${payments.length} registro${payments.length === 1 ? "" : "s"}`,
    `Generado ${props.generatedAt.toLocaleDateString("es-MX", { timeZone: "UTC" })}`,
  ].filter(Boolean).join(" · ");

  return (
    <Document title="Historial de Pagos" author={props.contextName}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <DocHeader
          tenant={{ name: "", brandLogoUrl: null, brandPrimaryColor: null }}
          billingEntity={{ legalName: props.contextName, rfc: null, address: null }}
        />
        <Text style={sharedStyles.title}>Historial de Pagos</Text>
        <Text style={sharedStyles.subtitle}>{subtitleParts}</Text>

        <View style={styles.tableHeaderRow}>
          <Text style={styles.cFecha}>Fecha</Text>
          <Text style={styles.cInquilino}>Inquilino</Text>
          <Text style={styles.cInmueble}>Inmueble / Local</Text>
          <Text style={styles.cPeriodo}>Periodo</Text>
          <Text style={styles.cMetodo}>Método</Text>
          <Text style={styles.cReferencia}>Referencia</Text>
          <Text style={styles.cMonto}>Monto</Text>
        </View>

        {payments.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={{ color: "#888", fontStyle: "italic" }}>
              Sin pagos para los filtros aplicados.
            </Text>
          </View>
        ) : (
          payments.map((p, i) => {
            const unitSub = p.isPlaza
              ? `${p.unitCode}${p.unitName ? ` — ${p.unitName}` : ""}`
              : null;
            return (
              <View
                key={i}
                style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
              >
                <Text style={styles.cFecha}>{cap(DATE.format(p.paymentDate))}</Text>
                <Text style={styles.cInquilino}>{p.legalName}</Text>
                <View style={styles.cInmueble}>
                  <Text>{p.propertyName}</Text>
                  {unitSub ? (
                    <Text style={styles.cInmuebleSub}>{unitSub}</Text>
                  ) : null}
                </View>
                <Text style={styles.cPeriodo}>{cap(PERIOD.format(p.period))}</Text>
                <Text style={styles.cMetodo}>{p.methodLabel}</Text>
                <Text style={styles.cReferencia}>{p.reference ?? "—"}</Text>
                <Text style={styles.cMonto}>{MXN.format(Number(p.amount))}</Text>
              </View>
            );
          })
        )}

        <View style={styles.totalRow}>
          <Text style={{ width: "90%" }}>TOTAL</Text>
          <Text style={styles.cMonto}>{MXN.format(Number(totalAmount))}</Text>
        </View>

        <DocFooter contactInfo={props.contactInfo} />
      </Page>
    </Document>
  );
}
