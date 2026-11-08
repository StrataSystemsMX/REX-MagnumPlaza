import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health",
  // Se autentica con CRON_SECRET; Clerk tomaría el Bearer de Vercel Cron como
  // token de sesión inválido y respondería 404.
  "/api/cron(.*)",
  "/api/webhooks(.*)",
  "/p/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals, healthcheck, cron y archivos estáticos.
    "/((?!_next|api/health|api/cron|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Siempre correr sobre rutas API salvo healthcheck y cron.
    "/(api/(?!health|cron)|trpc)(.*)",
  ],
};
