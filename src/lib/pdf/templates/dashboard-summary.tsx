import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  DocFooter,
  DocHeader,
  sharedStyles,
  type DocumentBillingEntity,
  type DocumentTenantInfo,
} from "./shared";
import { capitalizeFirst } from "@/lib/utils";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const PCT = (n: number) => `${Math.round(n * 100)}%`;
const MONTH_LABEL = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  kpiBox: {
    flex: 1,
    padding: 8,
    borderWidth: 0.5,
    borderColor: "#bbb",
    borderRadius: 4,
  },
  kpiLabel: { fontSize: 8, color: "#666", textTransform: "uppercase" },
  kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 4 },
  kpiSub: { fontSize: 8, color: "#666", marginTop: 2 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#444",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    fontSize: 8,
  },
  cellLeft: { flex: 2 },
  cellRight: { flex: 1, textAlign: "right" },
});

export interface DashboardSummaryPdfProps {
  tenant: DocumentTenantInfo;
  billingEntity: DocumentBillingEntity;
  contactInfo: string;
  asOfMonth: string;
  generatedAt: Date;
  summary: {
    totalProperties: number;
    totalUnits: number;
    occupancyRate: number;
    totalMonthlyExpectedIncome: string;
    totalCollectedThisMonth: string;
    totalOutstanding: string;
    overdueByLevel: { "1M": number; "2M": number; "3M": number };
  };
  byProperty: Array<{
    propertyName: string;
    occupancyRate: number;
    expectedIncome: string;
    collectedIncome: string;
  }>;
  byLegalEntity: Array<{
    code: string;
    legalName: string;
    income: string;
    expenses: string;
    profit: string;
  }>;
  topOverdue: Array<{
    legalName: string;
    outstanding: string;
    oldestDaysOverdue: number;
  }>;
}

function monthLabel(yyyymm: string): string {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(5, 7));
  return capitalizeFirst(MONTH_LABEL.format(new Date(Date.UTC(y, m - 1, 1))));
}

export function DashboardSummaryPdf(props: DashboardSummaryPdfProps) {
  const expected = Number(props.summary.totalMonthlyExpectedIncome);
  const collected = Number(props.summary.totalCollectedThisMonth);
  const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

  return (
    <Document
      title={`Dashboard ejecutivo — ${monthLabel(props.asOfMonth)}`}
      author={props.billingEntity.legalName}
    >
      <Page size="A4" style={sharedStyles.page}>
        <DocHeader tenant={props.tenant} billingEntity={props.billingEntity} />

        <Text style={sharedStyles.title}>Dashboard ejecutivo</Text>
        <Text style={sharedStyles.subtitle}>
          {monthLabel(props.asOfMonth)} · Generado {props.generatedAt.toLocaleDateString("es-MX")}
        </Text>

        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Inmuebles</Text>
            <Text style={styles.kpiValue}>{props.summary.totalProperties}</Text>
            <Text style={styles.kpiSub}>
              {props.summary.totalUnits} unidades · {PCT(props.summary.occupancyRate)} ocupadas
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Esperado del mes</Text>
            <Text style={styles.kpiValue}>{MXN.format(expected)}</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Cobrado este mes</Text>
            <Text style={styles.kpiValue}>{MXN.format(collected)}</Text>
            <Text style={styles.kpiSub}>{collectionRate}% del esperado</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Por cobrar</Text>
            <Text style={styles.kpiValue}>
              {MXN.format(Number(props.summary.totalOutstanding))}
            </Text>
            <Text style={styles.kpiSub}>
              1M: {props.summary.overdueByLevel["1M"]} · 2M:{" "}
              {props.summary.overdueByLevel["2M"]} · 3M:{" "}
              {props.summary.overdueByLevel["3M"]}
            </Text>
          </View>
        </View>

        {/* Por propiedad */}
        {props.byProperty.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Desempeño por inmueble</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.cellLeft}>Inmueble</Text>
              <Text style={styles.cellRight}>Ocupación</Text>
              <Text style={styles.cellRight}>Esperado</Text>
              <Text style={styles.cellRight}>Cobrado</Text>
            </View>
            {props.byProperty.map((p) => (
              <View key={p.propertyName} style={styles.tableRow}>
                <Text style={styles.cellLeft}>{p.propertyName}</Text>
                <Text style={styles.cellRight}>{PCT(p.occupancyRate)}</Text>
                <Text style={styles.cellRight}>{MXN.format(Number(p.expectedIncome))}</Text>
                <Text style={styles.cellRight}>{MXN.format(Number(p.collectedIncome))}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Por LegalEntity */}
        {props.byLegalEntity.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Resultado por razón social</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.cellLeft}>Razón social</Text>
              <Text style={styles.cellRight}>Ingreso</Text>
              <Text style={styles.cellRight}>Egreso</Text>
              <Text style={styles.cellRight}>Utilidad</Text>
            </View>
            {props.byLegalEntity.map((le) => (
              <View key={le.code} style={styles.tableRow}>
                <Text style={styles.cellLeft}>
                  {le.code} — {le.legalName}
                </Text>
                <Text style={styles.cellRight}>{MXN.format(Number(le.income))}</Text>
                <Text style={styles.cellRight}>{MXN.format(Number(le.expenses))}</Text>
                <Text style={styles.cellRight}>{MXN.format(Number(le.profit))}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Top morosos */}
        {props.topOverdue.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Top inquilinos morosos</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.cellLeft}>Inquilino</Text>
              <Text style={styles.cellRight}>Adeudo</Text>
              <Text style={styles.cellRight}>Días</Text>
            </View>
            {props.topOverdue.map((row) => (
              <View key={row.legalName} style={styles.tableRow}>
                <Text style={styles.cellLeft}>{row.legalName}</Text>
                <Text style={styles.cellRight}>{MXN.format(Number(row.outstanding))}</Text>
                <Text style={styles.cellRight}>{row.oldestDaysOverdue}d</Text>
              </View>
            ))}
          </>
        ) : null}

        <DocFooter contactInfo={props.contactInfo} />
      </Page>
    </Document>
  );
}
