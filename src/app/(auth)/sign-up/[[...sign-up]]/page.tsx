import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/server/auth/clerk-appearance";

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5 text-center lg:text-left">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Crea tu cuenta
        </h1>
        <p className="text-sm text-muted-foreground">
          Regístrate para empezar a usar Rex.
        </p>
      </div>
      <SignUp appearance={clerkAppearance} />
    </div>
  );
}
