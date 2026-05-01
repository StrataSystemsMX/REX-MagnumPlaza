import React from "react";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Estilos compartidos por todas las plantillas. Usamos sólo Helvetica
 * (default de PDFKit) — sin custom fonts para mantenerlo ligero.
 */
export const sharedStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#888",
  },
  headerLogo: { width: 56, height: 56, marginRight: 14, objectFit: "contain" },
  headerTextBlock: { flex: 1 },
  headerTenantName: { fontSize: 9, color: "#777", marginBottom: 2 },
  headerLegalName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  headerSmall: { fontSize: 8, color: "#555", marginTop: 1 },

  title: { fontSize: 17, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#666", marginBottom: 16 },

  section: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 8,
    color: "#777",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sectionValue: { fontSize: 11 },

  paragraph: { fontSize: 10, marginBottom: 8 },
  bold: { fontFamily: "Helvetica-Bold" },

  highlightBox: {
    marginTop: 10,
    marginBottom: 10,
    padding: 10,
    backgroundColor: "#f4f4f4",
    borderLeftWidth: 3,
    borderLeftColor: "#444",
  },

  legalNote: {
    fontSize: 9,
    color: "#444",
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
    fontStyle: "italic",
  },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#999",
    textAlign: "center",
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
  },

  // Tabla genérica
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#444",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    fontSize: 9,
  },
});

export interface DocumentTenantInfo {
  name: string;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
}

export interface DocumentBillingEntity {
  legalName: string;
  rfc: string | null;
  address: string | null;
}

interface DocHeaderProps {
  tenant: DocumentTenantInfo;
  billingEntity: DocumentBillingEntity;
}

export function DocHeader({ tenant, billingEntity }: DocHeaderProps) {
  return (
    <View style={sharedStyles.headerRow}>
      {tenant.brandLogoUrl ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- Image aquí es @react-pdf/renderer, no <img>
        <Image src={tenant.brandLogoUrl} style={sharedStyles.headerLogo} />
      ) : null}
      <View style={sharedStyles.headerTextBlock}>
        <Text style={sharedStyles.headerTenantName}>{tenant.name}</Text>
        <Text style={sharedStyles.headerLegalName}>{billingEntity.legalName}</Text>
        {billingEntity.rfc ? (
          <Text style={sharedStyles.headerSmall}>RFC: {billingEntity.rfc}</Text>
        ) : null}
        {billingEntity.address ? (
          <Text style={sharedStyles.headerSmall}>{billingEntity.address}</Text>
        ) : null}
      </View>
    </View>
  );
}

interface DocFooterProps {
  contactInfo: string;
}

export function DocFooter({ contactInfo }: DocFooterProps) {
  return (
    <View fixed style={sharedStyles.footer}>
      <Text>{contactInfo}</Text>
      <Text style={{ marginTop: 2 }}>
        Documento generado automáticamente por Strata Systems · Para
        aclaraciones contactar a la administración
      </Text>
    </View>
  );
}

/**
 * Helper: convierte un texto multi-párrafo (con \n\n) en un array de
 * <Text> separados, manteniendo espaciado consistente.
 */
export function MultilineText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((p, i) => (
        <Text key={i} style={sharedStyles.paragraph}>
          {p}
        </Text>
      ))}
    </>
  );
}
