import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

/**
 * Apariencia compartida para los componentes de Clerk (SignIn / SignUp).
 * Mapea el flujo de auth a los tokens de marca Strata definidos en globals.css
 * (Marine como primary, Frost/Slate para superficies, radios y fuente Outfit),
 * de modo que el login sea visualmente consistente con el resto de Rex.
 *
 * El header de Clerk se oculta porque cada página aporta su propio encabezado.
 */
type ClerkAppearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

export const clerkAppearance: ClerkAppearance = {
  variables: {
    colorPrimary: "#002c55", // Marine
    colorText: "#0b0e29", // Midnight
    colorTextSecondary: "oklch(0.5 0.04 240)", // muted-foreground
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#0b0e29",
    colorDanger: "oklch(0.577 0.245 27.325)",
    borderRadius: "0.625rem",
    fontFamily: "var(--font-outfit), ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-outfit), ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    // La tarjeta visible: superficie blanca con ring sutil (patrón de card del design system).
    card: "w-full gap-5 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-7",
    header: "hidden",
    // Botones sociales
    socialButtonsBlockButton:
      "h-10 border-border bg-card transition-colors hover:bg-accent",
    socialButtonsBlockButtonText: "font-medium text-foreground",
    // Separadores
    dividerLine: "bg-border",
    dividerText: "text-xs text-muted-foreground",
    // Campos
    formFieldLabel: "text-sm font-medium text-foreground",
    formFieldInput:
      "h-10 rounded-md border-input bg-background text-foreground shadow-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
    formFieldInputShowPasswordButton: "text-muted-foreground hover:text-foreground",
    // Botón principal
    formButtonPrimary:
      "h-10 rounded-md bg-primary text-sm font-medium normal-case text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40",
    // Enlaces y pie
    footer: "bg-transparent",
    footerActionText: "text-sm text-muted-foreground",
    footerActionLink: "text-sm font-medium text-primary hover:text-primary/80",
    identityPreviewEditButton: "text-primary hover:text-primary/80",
    formResendCodeLink: "text-primary hover:text-primary/80",
    otpCodeFieldInput: "border-input focus-visible:border-ring focus-visible:ring-ring/40",
  },
} satisfies ClerkAppearance;
