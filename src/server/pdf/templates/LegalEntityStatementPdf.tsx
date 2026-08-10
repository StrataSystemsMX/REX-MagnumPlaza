import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  DocFooter,
  DocHeader,
  sharedStyles,
  type DocumentBillingEntity,
  type DocumentTenantInfo,
} from "./shared";
import { propertyTypeLabel } from "@/shared/i18n/enums";
import type { PropertyType } from "@/generated/prisma/enums";
import type { LegalEntityYearMetrics } from "@/server/services/legal-entity-queries";
import { formatMXN } from "@/shared/format-currency";
import { formatDate } from "@/shared/format-date";

const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function money(v: string | number): string {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? formatMXN(n) : "—";
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 50,
    paddingHorizontal: 28,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#1a1a1a",
    lineHeight: 1.35,
  },
  sectionLabel: {
    fontSize: 7.5,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 4,
  },
  // KPI cards
  kpiRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  kpiCard: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    backgroundColor: "#fafafa",
  },
  kpiLabel: { fontSize: 6.5, color: "#888", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  // Monthly table
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#555",
    backgroundColor: "#f3f4f6",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.3,
    borderBottomColor: "#e5e7eb",
    fontSize: 7.5,
  },
  profitRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderTopWidth: 0.8,
    borderBottomWidth: 0.5,
    borderColor: "#555",
    backgroundColor: "#eff6ff",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
  },
  cellConcept: { flex: 2.2 },
  cellMonth: { flex: 1.25, textAlign: "right" },
  cellTotal: { flex: 1.7, textAlign: "right", fontFamily: "Helvetica-Bold" },
  // Two-column layout
  twoCol: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  twoColLeft: { flex: 1 },
  twoColRight: { flex: 1 },
  // Simple table rows
  simpleHeaderRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#555",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
  },
  simpleRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.3,
    borderBottomColor: "#e5e7eb",
    fontSize: 8,
  },
  simpleTotalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderTopWidth: 0.8,
    borderTopColor: "#555",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  // Inmuebles table (full width)
  propHeaderRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#555",
    backgroundColor: "#f3f4f6",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
  },
  propRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.3,
    borderBottomColor: "#e5e7eb",
    fontSize: 8,
    alignItems: "center",
  },
  rolPill: {
    fontSize: 6.5,
    color: "#555",
    borderWidth: 0.5,
    borderColor: "#ccc",
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
  },
  emptyNote: { fontSize: 7.5, color: "#aaa", fontStyle: "italic", paddingVertical: 6 },
});

export interface LegalEntityStatementPdfProps {
  tenant: DocumentTenantInfo;
  billingEntity: DocumentBillingEntity;
  contactInfo: string;
  generatedAt: Date;
  metrics: LegalEntityYearMetrics;
}

export function LegalEntityStatementPdf(props: LegalEntityStatementPdfProps) {
  const { metrics } = props;
  const profit = Number(metrics.totalProfit);
  const occupancyPct =
    metrics.totalUnits > 0
      ? Math.round((metrics.occupiedUnits / metrics.totalUnits) * 100)
      : 0;

  // Build a map from propertyId → income amount for the properties table
  const incomeMap = new Map(
    metrics.incomeByProperty.map((r) => [r.propertyId, r.amount]),
  );

  return (
    <Document
      title={`Estado de Resultados ${metrics.code} ${metrics.year}`}
      author={props.billingEntity.legalName}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <DocHeader tenant={props.tenant} billingEntity={props.billingEntity} />

        <Text style={sharedStyles.title}>Estado de Resultados — {metrics.code}</Text>
        <Text style={sharedStyles.subtitle}>
          {metrics.legalName}
          {metrics.rfc ? ` · RFC ${metrics.rfc}` : ""} · Ejercicio {metrics.year} ·
          Generado {formatDate(props.generatedAt)}
        </Text>

        {/* KPIs — 5 tarjetas */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Ingresos del año</Text>
            <Text style={styles.kpiValue}>{formatMXN(Number(metrics.totalIncome))}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Renta esperada / mes</Text>
            <Text style={styles.kpiValue}>{money(metrics.expectedMonthlyRent)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Egresos del año</Text>
            <Text style={styles.kpiValue}>{formatMXN(Number(metrics.totalExpenses))}</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: profit >= 0 ? "#ecfdf5" : "#fef2f2", borderColor: profit >= 0 ? "#bbf7d0" : "#fecaca" }]}>
            <Text style={styles.kpiLabel}>Utilidad del año</Text>
            <Text style={[styles.kpiValue, { color: profit >= 0 ? "#047857" : "#b91c1c" }]}>
              {formatMXN(profit)}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Ocupación</Text>
            <Text style={styles.kpiValue}>
              {occupancyPct}%{"  "}
              <Text style={{ fontSize: 8, color: "#777", fontFamily: "Helvetica" }}>
                {metrics.occupiedUnits}/{metrics.totalUnits}
              </Text>
            </Text>
          </View>
        </View>

        {/* Cierre mensual */}
        <Text style={styles.sectionLabel}>Cierre mensual</Text>
        <View wrap={false}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.cellConcept}>Concepto</Text>
            {MONTHS_SHORT.map((m) => (
              <Text key={m} style={styles.cellMonth}>{m}</Text>
            ))}
            <Text style={styles.cellTotal}>Total</Text>
          </View>
          <MonthlyRow label="Ingresos" monthly={metrics.monthlyIncome} total={metrics.totalIncome} />
          <MonthlyRow label="Egresos" monthly={metrics.monthlyExpenses} total={metrics.totalExpenses} />
          <View style={styles.profitRow}>
            <Text style={styles.cellConcept}>Utilidad</Text>
            {metrics.monthlyProfit.map((v, i) => (
              <Text
                key={i}
                style={[styles.cellMonth, { color: Number(v) < 0 ? "#b91c1c" : Number(v) > 0 ? "#047857" : "#1a1a1a" }]}
              >
                {money(v)}
              </Text>
            ))}
            <Text style={[styles.cellTotal, { color: profit >= 0 ? "#047857" : "#b91c1c" }]}>
              {formatMXN(profit)}
            </Text>
          </View>
        </View>

        {/* Egresos por categoría */}
        <Text style={styles.sectionLabel}>Egresos por categoría</Text>
        {metrics.expensesByCategory.length === 0 ? (
          <Text style={styles.emptyNote}>Sin egresos registrados.</Text>
        ) : (
          <View>
            <View style={styles.simpleHeaderRow} fixed>
              <Text style={{ flex: 4 }}>Categoría</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>Monto</Text>
            </View>
            {metrics.expensesByCategory.map((row) => (
              <View key={row.categoryName} style={styles.simpleRow}>
                <Text style={{ flex: 4 }}>{row.categoryName}</Text>
                <Text style={{ flex: 1, textAlign: "right" }}>
                  {formatMXN(Number(row.amount))}
                </Text>
              </View>
            ))}
            <View style={styles.simpleTotalRow}>
              <Text style={{ flex: 4 }}>TOTAL</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>
                {formatMXN(Number(metrics.totalExpenses))}
              </Text>
            </View>
          </View>
        )}

        {/* Ingresos por inmueble */}
        <Text style={styles.sectionLabel}>Ingresos por inmueble</Text>
        {metrics.incomeByProperty.length === 0 ? (
          <Text style={styles.emptyNote}>Sin ingresos por inmueble.</Text>
        ) : (
          <View wrap={false}>
            <View style={styles.simpleHeaderRow}>
              <Text style={{ flex: 4 }}>Inmueble</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>Ingresos</Text>
            </View>
            {metrics.incomeByProperty.map((row) => (
              <View key={row.propertyId} style={styles.simpleRow}>
                <Text style={{ flex: 4 }}>{row.propertyName}</Text>
                <Text style={{ flex: 1, textAlign: "right" }}>
                  {formatMXN(Number(row.amount))}
                </Text>
              </View>
            ))}
            <View style={styles.simpleTotalRow}>
              <Text style={{ flex: 4 }}>TOTAL</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>
                {formatMXN(Number(metrics.totalIncome))}
              </Text>
            </View>
          </View>
        )}

        {/* Inmuebles — tabla completa */}
        <Text style={styles.sectionLabel}>Inmuebles</Text>
        {metrics.properties.length === 0 ? (
          <Text style={styles.emptyNote}>Sin inmuebles asociados.</Text>
        ) : (
          <View wrap={false}>
            <View style={styles.propHeaderRow}>
              <Text style={{ flex: 3 }}>Inmueble</Text>
              <Text style={{ flex: 2 }}>Tipo</Text>
              <Text style={{ flex: 1, textAlign: "center" }}>Rol</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>Ingresos {metrics.year}</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>Ocupación</Text>
            </View>
            {metrics.properties.map((p) => (
              <View key={p.id} style={styles.propRow}>
                <Text style={{ flex: 3, fontFamily: "Helvetica-Bold" }}>{p.name}</Text>
                <Text style={{ flex: 2, color: "#555" }}>
                  {propertyTypeLabel(p.type as PropertyType)}
                </Text>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={styles.rolPill}>
                    {p.isOwner && p.isManager ? "Dueño · Admin" : p.isOwner ? "Dueño" : "Administrador"}
                  </Text>
                </View>
                <Text style={{ flex: 1, textAlign: "right" }}>
                  {money(incomeMap.get(p.id) ?? 0)}
                </Text>
                <Text style={{ flex: 1, textAlign: "right", color: "#555" }}>
                  {p.totalUnits > 0
                    ? `${p.occupiedUnits}/${p.totalUnits} (${Math.round((p.occupiedUnits / p.totalUnits) * 100)}%)`
                    : "—"}
                </Text>
              </View>
            ))}
          </View>
        )}

        <DocFooter contactInfo={props.contactInfo} />
      </Page>
    </Document>
  );
}

function MonthlyRow({
  label,
  monthly,
  total,
}: {
  label: string;
  monthly: string[];
  total: string;
}) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.cellConcept}>{label}</Text>
      {monthly.map((v, i) => (
        <Text key={i} style={styles.cellMonth}>{money(v)}</Text>
      ))}
      <Text style={styles.cellTotal}>{formatMXN(Number(total))}</Text>
    </View>
  );
}
