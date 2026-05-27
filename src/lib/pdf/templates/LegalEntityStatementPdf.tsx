import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  DocFooter,
  DocHeader,
  sharedStyles,
  type DocumentBillingEntity,
  type DocumentTenantInfo,
} from "./shared";
import { propertyTypeLabel } from "@/lib/i18n/enums";
import type { PropertyType } from "@/generated/prisma/enums";
import type { LegalEntityYearMetrics } from "@/lib/services/legal-entity-queries";

const MXN_INT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const styles = StyleSheet.create({
  pageLandscape: {
    paddingTop: 28,
    paddingBottom: 50,
    paddingHorizontal: 28,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#1a1a1a",
    lineHeight: 1.3,
  },
  sectionLabel: {
    fontSize: 8,
    color: "#777",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  // Tarjetas resumen
  summaryRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  summaryCard: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
  },
  summaryCardLabel: { fontSize: 7, color: "#777", marginBottom: 2 },
  summaryCardValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  // Tabla mensual (cierre)
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#444",
    backgroundColor: "#f3f3f3",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.3,
    borderBottomColor: "#ddd",
    fontSize: 7.5,
  },
  profitRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderTopWidth: 1,
    borderBottomWidth: 0.5,
    borderColor: "#444",
    backgroundColor: "#eaeaea",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
  },
  cellConcept: { flex: 2.4 },
  cellMonth: { flex: 1.3, textAlign: "right" },
  cellTotal: { flex: 1.8, textAlign: "right", fontFamily: "Helvetica-Bold" },
  // Tabla simple a 2 columnas
  twoCol: { flexDirection: "row", gap: 16 },
  twoColItem: { flex: 1 },
  simpleHeaderRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#444",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  simpleRow: {
    flexDirection: "row",
    paddingVertical: 2.5,
    borderBottomWidth: 0.3,
    borderBottomColor: "#ddd",
    fontSize: 8,
  },
  simpleTotalRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderTopWidth: 1,
    borderTopColor: "#444",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    fontSize: 7,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
  },
  emptyNote: { fontSize: 8, color: "#888", fontStyle: "italic", paddingVertical: 6 },
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
  const properties = [...metrics.ownedProperties, ...metrics.managedProperties];

  return (
    <Document
      title={`Estado de Resultados ${metrics.code} ${metrics.year}`}
      author={props.billingEntity.legalName}
    >
      <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
        <DocHeader tenant={props.tenant} billingEntity={props.billingEntity} />

        <Text style={sharedStyles.title}>
          Estado de Resultados — {metrics.code}
        </Text>
        <Text style={sharedStyles.subtitle}>
          {metrics.legalName}
          {metrics.rfc ? ` · RFC ${metrics.rfc}` : ""} · Ejercicio {metrics.year} ·
          Generado {props.generatedAt.toLocaleDateString("es-MX", { timeZone: "UTC" })}
        </Text>

        {/* Resumen anual */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>INGRESOS DEL AÑO</Text>
            <Text style={styles.summaryCardValue}>
              {MXN_INT.format(Number(metrics.totalIncome))}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>EGRESOS DEL AÑO</Text>
            <Text style={styles.summaryCardValue}>
              {MXN_INT.format(Number(metrics.totalExpenses))}
            </Text>
          </View>
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: profit >= 0 ? "#ecfdf5" : "#fef2f2" },
            ]}
          >
            <Text style={styles.summaryCardLabel}>UTILIDAD DEL AÑO</Text>
            <Text
              style={[
                styles.summaryCardValue,
                { color: profit >= 0 ? "#047857" : "#b91c1c" },
              ]}
            >
              {MXN_INT.format(profit)}
            </Text>
          </View>
        </View>

        {/* Cierre mensual */}
        <Text style={styles.sectionLabel}>Cierre mensual</Text>
        <View wrap={false}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.cellConcept}>Concepto</Text>
            {MONTHS_SHORT.map((m) => (
              <Text key={m} style={styles.cellMonth}>
                {m}
              </Text>
            ))}
            <Text style={styles.cellTotal}>Total</Text>
          </View>
          <MonthlyRow
            label="Ingresos"
            monthly={metrics.monthlyIncome}
            total={metrics.totalIncome}
          />
          <MonthlyRow
            label="Egresos"
            monthly={metrics.monthlyExpenses}
            total={metrics.totalExpenses}
          />
          <View style={styles.profitRow}>
            <Text style={styles.cellConcept}>Utilidad</Text>
            {metrics.monthlyProfit.map((v, i) => (
              <Text key={i} style={styles.cellMonth}>
                {Number(v) === 0 ? "—" : MXN_INT.format(Number(v))}
              </Text>
            ))}
            <Text style={styles.cellTotal}>{MXN_INT.format(profit)}</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          {/* Egresos por categoría */}
          <View style={styles.twoColItem}>
            <Text style={styles.sectionLabel}>Egresos por categoría</Text>
            {metrics.expensesByCategory.length === 0 ? (
              <Text style={styles.emptyNote}>Sin egresos registrados.</Text>
            ) : (
              <View>
                <View style={styles.simpleHeaderRow}>
                  <Text style={{ flex: 3 }}>Categoría</Text>
                  <Text style={{ flex: 1, textAlign: "right" }}>Monto</Text>
                </View>
                {metrics.expensesByCategory.map((row) => (
                  <View key={row.categoryName} style={styles.simpleRow}>
                    <Text style={{ flex: 3 }}>{row.categoryName}</Text>
                    <Text style={{ flex: 1, textAlign: "right" }}>
                      {MXN_INT.format(Number(row.amount))}
                    </Text>
                  </View>
                ))}
                <View style={styles.simpleTotalRow}>
                  <Text style={{ flex: 3 }}>TOTAL</Text>
                  <Text style={{ flex: 1, textAlign: "right" }}>
                    {MXN_INT.format(Number(metrics.totalExpenses))}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Inmuebles asociados */}
          <View style={styles.twoColItem}>
            <Text style={styles.sectionLabel}>Inmuebles asociados</Text>
            {properties.length === 0 ? (
              <Text style={styles.emptyNote}>No hay inmuebles asociados.</Text>
            ) : (
              <View>
                <View style={styles.simpleHeaderRow}>
                  <Text style={{ flex: 3 }}>Inmueble</Text>
                  <Text style={{ flex: 2 }}>Tipo</Text>
                  <Text style={{ flex: 1.4, textAlign: "right" }}>Rol</Text>
                </View>
                {properties.map((p) => (
                  <View key={`${p.id}-${p.isOwner ? "o" : "m"}`} style={styles.simpleRow}>
                    <Text style={{ flex: 3 }}>{p.name}</Text>
                    <Text style={{ flex: 2, color: "#555" }}>
                      {propertyTypeLabel(p.type as PropertyType)}
                    </Text>
                    <View style={{ flex: 1.4, alignItems: "flex-end" }}>
                      <Text
                        style={[
                          styles.badge,
                          { backgroundColor: p.isOwner ? "#1f2937" : "#64748b" },
                        ]}
                      >
                        {p.isOwner ? "Dueño" : "Administra"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

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
        <Text key={i} style={styles.cellMonth}>
          {Number(v) === 0 ? "—" : MXN_INT.format(Number(v))}
        </Text>
      ))}
      <Text style={styles.cellTotal}>{MXN_INT.format(Number(total))}</Text>
    </View>
  );
}
