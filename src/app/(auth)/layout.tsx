import type { ReactNode, SVGProps } from "react";

/** Glifo de edificio de la marca Strata (mismo trazo que assets/strata-logo.svg). */
function StrataGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M9 25V11a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14" />
      <path d="M20 14h2a2 2 0 0 1 2 2v9" />
      <path d="M8 25h17" />
      <path d="M13 12h2" />
      <path d="M13 16h2" />
      <path d="M13 20h2" />
    </svg>
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const highlights = [
  "Cobranza con calendario y avisos automáticos",
  "Inmuebles, contratos e inquilinos en un solo lugar",
  "Estados de cuenta y cartas de desalojo en PDF",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca — sólo en pantallas grandes */}
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        {/* Glows decorativos */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-white/[0.06] blur-3xl"
        />
        {/* Retícula sutil */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20">
            <StrataGlyph className="size-6 text-primary-foreground" />
          </span>
          <div className="leading-tight">
            <div className="font-heading text-lg font-semibold tracking-tight">Rex</div>
            <div className="text-xs text-primary-foreground/70">by Strata Systems</div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-heading text-3xl font-semibold leading-tight tracking-tight text-balance">
            Administra tus plazas sin depender del Excel.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-primary-foreground/70">
            El CRM inmobiliario que centraliza la operación de tus administradoras:
            propiedades, contratos y cobranza, con trazabilidad completa.
          </p>
          <ul className="mt-8 space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/20">
                  <CheckIcon className="size-3 text-primary-foreground" />
                </span>
                <span className="text-primary-foreground/90">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/60">
          © {year} Strata Systems MX · Rex CRM Inmobiliario
        </p>
      </aside>

      {/* Panel de formulario */}
      <main className="flex flex-col items-center justify-center bg-background px-4 py-10 sm:px-6">
        {/* Marca compacta — visible sólo en móvil/tablet */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <StrataGlyph className="size-5" />
          </span>
          <div className="leading-tight">
            <div className="font-heading text-base font-semibold tracking-tight">Rex</div>
            <div className="text-xs text-muted-foreground">by Strata Systems</div>
          </div>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
