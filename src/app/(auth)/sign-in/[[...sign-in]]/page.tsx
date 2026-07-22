import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5 text-center lg:text-left">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Bienvenido de vuelta
        </h1>
        <p className="text-sm text-muted-foreground">
          Inicia sesión para continuar en Rex.
        </p>
      </div>
      <SignIn appearance={clerkAppearance} />
    </div>
  );
}
