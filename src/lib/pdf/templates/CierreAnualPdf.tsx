import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  DocFooter,
  DocHeader,
  sharedStyles,
  type DocumentBillingEntity,
  type DocumentTenantInfo,
} from "./shared";
import type { AnnualClosing, Monthly12 } from "@/lib/services/cierres-queries";

const MXN_INT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const ENTITY_COLOR: Record<string, string> = {
  CRT: "#f97316", // orange-500
  TSR: "#3b82f6", // blue-500
  QHS: "#10b981", // emerald-500
  JCL: "#8b5cf6", // violet-500
};

const styles = StyleSheet.create({
  pageLandscape: {
    paddingTop: 28,
    paddingBottom: 50,
    paddingHorizontal: 28,
    fontFamily: "Helvetica",
    fontSize: 7,
    color: "#1a1a1a",
    lineHeight: 1.3,
  },
  sectionLabel: {
    fontSize: 8,
    color: "#777",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 4,
  },
  blockHeader: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 0,
    color: "#ffffff",
    alignItems: "center",
  },
  blockHeaderTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    flex: 1,
  },
  blockHeaderTotal: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
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
  totalRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderTopWidth: 1,
    borderBottomWidth: 0.5,
    borderColor: "#444",
    backgroundColor: "#eaeaea",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
  },
  cellLabel: { flex: 4 },
  cellMonth: { flex: 1.3, textAlign: "right" },
  cellTotal: {
    flex: 1.7,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  finalCard: {
    marginTop: 14,
    padding: 10,
    borderWidth: 1.5,
    borderColor: "#1a1a1a",
    borderRadius: 4,
  },
  finalCardRow: {
    flexDirection: "row",
    paddingVertical: 3,
    fontSize: 8,
  },
  finalCardRowFinal: {
    flexDirection: "row",
    paddingVertical: 5,
    marginTop: 3,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    backgroundColor: "#ecfdf5",
  },
});

export interface CierreAnualPdfProps {
  tenant: DocumentTenantInfo;
  billingEntity: DocumentBillingEntity;
  contactInfo: string;
  generatedAt: Date;
  closing: AnnualClosing;
  /** Si se proporciona, sólo se imprime esta entidad. */
  entityFilter?: string | null;
}

export function CierreAnualPdf(props: CierreAnualPdfProps) {
  const { closing, entityFilter } = props;
  const entityFilterCode = entityFilter ?? null;
  const passes = (code: string) =>
    !entityFilterCode || entityFilterCode === code;

  const incomeEntities = closing.legalEntities.filter(
    (le) => Number(closing.summary.perEntity[le.code]?.incomeTotal ?? "0") > 0,
  );
  const expenseEntities = closing.legalEntities.filter(
    (le) => Number(closing.summary.perEntity[le.code]?.expenseTotal ?? "0") > 0,
  );

  return (
    <Document
      title={`Cierre Anual ${closing.year}`}
      author={props.billingEntity.legalName}
    >
      <Page size="A4" orientation="landscape" style={styles.pageLandscape}>
        <DocHeader tenant={props.tenant} billingEntity={props.billingEntity} />

        <Text style={sharedStyles.title}>Cierre Anual {closing.year}</Text>
        <Text style={sharedStyles.subtitle}>
          Generado{" "}
          {props.generatedAt.toLocaleDateString("es-MX", { timeZone: "UTC" })}
          {entityFilterCode ? ` · ${entityFilterCode}` : ""}
        </Text>

        {/* INGRESOS */}
        {incomeEntities.some((le) => passes(le.code)) && (
          <Text style={styles.sectionLabel}>Ingresos</Text>
        )}
        {incomeEntities
          .filter((le) => passes(le.code))
          .map((le) => {
            const matrix = closing.incomeByEntity[le.code];
            if (!matrix) return null;
            return (
              <PivotBlock
                key={`income-${le.code}`}
                title={`${le.code} — Ingresos`}
                subtitle="Cobros recibidos"
                color={ENTITY_COLOR[le.code] ?? "#475569"}
                firstColLabel="Inmueble"
                rows={matrix.rows.map((r) => ({
                  key: r.key,
                  label: r.label,
                  monthly: r.monthly,
                  total: r.total,
                }))}
                monthlyTotals={matrix.monthlyTotals}
                grandTotal={matrix.grandTotal}
              />
            );
          })}

        {/* EGRESOS */}
        {expenseEntities.some((le) => passes(le.code)) && (
          <Text style={styles.sectionLabel}>Egresos</Text>
        )}
        {expenseEntities
          .filter((le) => passes(le.code))
          .map((le) => {
            const matrix = closing.expensesByEntity[le.code];
            if (!matrix) return null;
            return (
              <PivotBlock
                key={`expense-${le.code}`}
                title={`${le.code} — Egresos`}
                subtitle="Operativo + nómina + predial + financiamiento"
                color={ENTITY_COLOR[le.code] ?? "#475569"}
                firstColLabel="Categoría"
                rows={matrix.rows.map((r) => ({
                  key: r.key,
                  label: r.sublabel ? `${r.label} (${r.sublabel})` : r.label,
                  monthly: r.monthly,
                  total: r.total,
                }))}
                monthlyTotals={matrix.monthlyTotals}
                grandTotal={matrix.grandTotal}
              />
            );
          })}

        {/* Resumen operativo */}
        <Text style={styles.sectionLabel}>Resumen operativo</Text>
        <View>
          <View
            style={[styles.blockHeader, { backgroundColor: "#1f2937" }]}
            wrap={false}
          >
            <Text style={styles.blockHeaderTitle}>
              Resumen operativo · Ingresos − Egresos = Utilidad por entidad
            </Text>
            <Text style={styles.blockHeaderTotal}>
              {MXN_INT.format(Number(closing.summary.operativeUtilityTotal))}
            </Text>
          </View>
          <SummaryTable closing={closing} />
        </View>

        {/* Estrategia fiscal */}
        {closing.fiscalStrategy.rows.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Estrategia fiscal</Text>
            <PivotBlock
              title="Sueldo adicional y estrategia"
              subtitle="Por debajo de la utilidad operativa"
              color="#d97706"
              firstColLabel="Concepto"
              rows={closing.fiscalStrategy.rows.map((r) => ({
                key: r.key,
                label: r.label,
                monthly: r.monthly,
                total: r.total,
              }))}
              monthlyTotals={closing.fiscalStrategy.monthlyTotals}
              grandTotal={closing.fiscalStrategy.grandTotal}
            />
          </>
        )}

        {/* Inversiones */}
        {closing.investments.rows.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Inversiones, hipoteca y préstamos</Text>
            <PivotBlock
              title="Inversiones y financiamiento de largo plazo"
              subtitle="Hipoteca + préstamos asociados"
              color="#334155"
              firstColLabel="Concepto"
              rows={closing.investments.rows.map((r) => ({
                key: r.key,
                label: r.sublabel ? `${r.label} (${r.sublabel})` : r.label,
                monthly: r.monthly,
                total: r.total,
              }))}
              monthlyTotals={closing.investments.monthlyTotals}
              grandTotal={closing.investments.grandTotal}
            />
          </>
        )}

        {/* Utilidad final */}
        <View style={styles.finalCard} wrap={false}>
          <Text style={[sharedStyles.title, { fontSize: 10, marginBottom: 6 }]}>
            Utilidad final
          </Text>
          <FinalRow
            label="Utilidad operativa"
            total={closing.summary.operativeUtilityTotal}
          />
          <FinalRow
            label="− Estrategia fiscal"
            total={closing.fiscalStrategy.grandTotal}
            muted
          />
          <FinalRow
            label="− Inversiones"
            total={closing.investments.grandTotal}
            muted
          />
          <View style={styles.finalCardRowFinal}>
            <Text style={{ flex: 1 }}>UTILIDAD − INVERSIONES − REPARTO</Text>
            <Text>{MXN_INT.format(Number(closing.finalUtility.total))}</Text>
          </View>
        </View>

        <DocFooter contactInfo={props.contactInfo} />
      </Page>
    </Document>
  );
}

// ----------------------------------------------------------------------------
// Sub-componentes
// ----------------------------------------------------------------------------

interface PivotBlockProps {
  title: string;
  subtitle?: string;
  color: string;
  firstColLabel: string;
  rows: Array<{ key: string; label: string; monthly: Monthly12; total: string }>;
  monthlyTotals: Monthly12;
  grandTotal: string;
}

function PivotBlock({
  title,
  subtitle,
  color,
  firstColLabel,
  rows,
  monthlyTotals,
  grandTotal,
}: PivotBlockProps) {
  return (
    <View style={{ marginBottom: 6 }} wrap={false}>
      <View style={[styles.blockHeader, { backgroundColor: color }]}>
        <Text style={styles.blockHeaderTitle}>{title}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 7, opacity: 0.9, marginLeft: 6 }}>{subtitle}</Text>
        ) : null}
        <Text style={[styles.blockHeaderTotal, { marginLeft: "auto" }]}>
          {MXN_INT.format(Number(grandTotal))}
        </Text>
      </View>
      <View style={styles.tableHeaderRow}>
        <Text style={styles.cellLabel}>{firstColLabel}</Text>
        {MONTHS_SHORT.map((m) => (
          <Text key={m} style={styles.cellMonth}>
            {m}
          </Text>
        ))}
        <Text style={styles.cellTotal}>Total</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.tableRow}>
          <Text style={{ color: "#888", fontStyle: "italic" }}>
            Sin movimientos en este periodo.
          </Text>
        </View>
      ) : (
        rows.map((row) => (
          <View key={row.key} style={styles.tableRow}>
            <Text style={styles.cellLabel}>{row.label}</Text>
            {row.monthly.map((v, i) => (
              <Text key={i} style={styles.cellMonth}>
                {Number(v) === 0 ? "—" : MXN_INT.format(Number(v))}
              </Text>
            ))}
            <Text style={styles.cellTotal}>
              {MXN_INT.format(Number(row.total))}
            </Text>
          </View>
        ))
      )}
      {rows.length > 0 ? (
        <View style={styles.totalRow}>
          <Text style={styles.cellLabel}>TOTAL</Text>
          {monthlyTotals.map((v, i) => (
            <Text key={i} style={styles.cellMonth}>
              {Number(v) === 0 ? "—" : MXN_INT.format(Number(v))}
            </Text>
          ))}
          <Text style={styles.cellTotal}>
            {MXN_INT.format(Number(grandTotal))}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SummaryTable({ closing }: { closing: AnnualClosing }) {
  const entities = closing.legalEntities.filter((le) => {
    const s = closing.summary.perEntity[le.code];
    return s && (Number(s.incomeTotal) !== 0 || Number(s.expenseTotal) !== 0);
  });

  return (
    <View wrap={false}>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.cellLabel, { flex: 2 }]}>Razón social</Text>
        <Text style={[styles.cellLabel, { flex: 2 }]}>Concepto</Text>
        {MONTHS_SHORT.map((m) => (
          <Text key={m} style={styles.cellMonth}>
            {m}
          </Text>
        ))}
        <Text style={styles.cellTotal}>Total</Text>
      </View>
      {entities.map((le) => {
        const s = closing.summary.perEntity[le.code]!;
        return (
          <React.Fragment key={le.code}>
            <SummaryRow
              entityLabel={le.code}
              color={ENTITY_COLOR[le.code] ?? "#475569"}
              concept="Ingresos"
              conceptColor="#047857"
              monthly={s.income}
              total={s.incomeTotal}
              showEntity
            />
            <SummaryRow
              entityLabel={le.code}
              color={ENTITY_COLOR[le.code] ?? "#475569"}
              concept="Egresos"
              conceptColor="#b91c1c"
              monthly={s.expense}
              total={s.expenseTotal}
            />
            <SummaryRow
              entityLabel={le.code}
              color={ENTITY_COLOR[le.code] ?? "#475569"}
              concept="Utilidad"
              conceptColor={Number(s.utilityTotal) >= 0 ? "#1f2937" : "#b91c1c"}
              monthly={s.utility}
              total={s.utilityTotal}
              bold
            />
          </React.Fragment>
        );
      })}
      <View style={styles.totalRow}>
        <Text style={[styles.cellLabel, { flex: 4 }]}>UTILIDAD OPERATIVA</Text>
        {closing.summary.operativeUtility.map((v, i) => (
          <Text key={i} style={styles.cellMonth}>
            {Number(v) === 0 ? "—" : MXN_INT.format(Number(v))}
          </Text>
        ))}
        <Text style={styles.cellTotal}>
          {MXN_INT.format(Number(closing.summary.operativeUtilityTotal))}
        </Text>
      </View>
    </View>
  );
}

interface SummaryRowProps {
  entityLabel: string;
  color: string;
  concept: string;
  conceptColor: string;
  monthly: Monthly12;
  total: string;
  showEntity?: boolean;
  bold?: boolean;
}

function SummaryRow({
  entityLabel,
  color,
  concept,
  conceptColor,
  monthly,
  total,
  showEntity,
  bold,
}: SummaryRowProps) {
  return (
    <View style={styles.tableRow}>
      <View style={[styles.cellLabel, { flex: 2 }]}>
        {showEntity ? (
          <Text
            style={{
              backgroundColor: color,
              color: "#ffffff",
              alignSelf: "flex-start",
              paddingHorizontal: 4,
              paddingVertical: 1,
              borderRadius: 2,
              fontFamily: "Helvetica-Bold",
              fontSize: 7,
            }}
          >
            {entityLabel}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          ...styles.cellLabel,
          flex: 2,
          color: conceptColor,
          ...(bold ? { fontFamily: "Helvetica-Bold" } : {}),
        }}
      >
        {concept}
      </Text>
      {monthly.map((v, i) => (
        <Text
          key={i}
          style={{
            ...styles.cellMonth,
            color: conceptColor,
            ...(bold ? { fontFamily: "Helvetica-Bold" } : {}),
          }}
        >
          {Number(v) === 0 ? "—" : MXN_INT.format(Number(v))}
        </Text>
      ))}
      <Text
        style={{
          ...styles.cellTotal,
          color: conceptColor,
          ...(bold ? { fontFamily: "Helvetica-Bold" } : {}),
        }}
      >
        {MXN_INT.format(Number(total))}
      </Text>
    </View>
  );
}

interface FinalRowProps {
  label: string;
  total: string;
  muted?: boolean;
}

function FinalRow({ label, total, muted }: FinalRowProps) {
  return (
    <View style={styles.finalCardRow}>
      <Text style={{ flex: 1, ...(muted ? { color: "#666" } : {}) }}>{label}</Text>
      <Text style={muted ? { color: "#666" } : {}}>
        {MXN_INT.format(Number(total))}
      </Text>
    </View>
  );
}
