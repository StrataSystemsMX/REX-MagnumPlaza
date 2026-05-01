import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Cargar primero .env.local (overrides developer-specific) y luego .env (base).
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
if (!url) {
  throw new Error(
    "DATABASE_URL no está definido. Copia .env.example a .env.local y configura la conexión.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url },
});
