import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Cuenta no autorizada" };

/**
 * Página de aterrizaje cuando una cuenta de Clerk autenticada no tiene un
 * User vinculado en la base (requireAuth es fail-closed en producción:
 * nunca auto-provisiona). El alta la hace un administrador vía seed o
 * invitación explícita.
 */
export default function CuentaNoAutorizadaPage() {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Tu cuenta no tiene acceso
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Esta cuenta no está registrada en Rex. Si crees que es un error,
          contacta al administrador de tu organización para que te dé de alta.
        </p>
      </div>
      <SignOutButton redirectUrl="/sign-in">
        <Button variant="outline" className="w-full">
          Cerrar sesión
        </Button>
      </SignOutButton>
    </div>
  );
}
