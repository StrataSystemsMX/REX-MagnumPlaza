import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.production.local" });
loadEnv({ path: ".env.local", override: false });
loadEnv({ path: ".env", override: false });

type Check = {
  name: string;
  required: boolean;
  validate?: (value: string) => string | null;
};

const requiredChecks: Check[] = [
  { name: "NEXT_PUBLIC_APP_URL", required: true, validate: mustBeHttpsUrl },
  { name: "DATABASE_URL", required: true, validate: mustBeProductionDatabaseUrl },
  { name: "DIRECT_URL", required: true, validate: mustBeProductionDatabaseUrl },
  {
    name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    required: true,
    validate: mustStartWith("pk_live_"),
  },
  { name: "CLERK_SECRET_KEY", required: true, validate: mustStartWith("sk_live_") },
  { name: "NEXT_PUBLIC_CLERK_SIGN_IN_URL", required: true },
  { name: "NEXT_PUBLIC_CLERK_SIGN_UP_URL", required: true },
  { name: "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL", required: true },
  { name: "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL", required: true },
  { name: "CLERK_WEBHOOK_SECRET", required: true },
  { name: "R2_ACCOUNT_ID", required: true },
  { name: "R2_ACCESS_KEY_ID", required: true },
  { name: "R2_SECRET_ACCESS_KEY", required: true },
  { name: "R2_BUCKET_NAME", required: true },
  { name: "R2_PUBLIC_URL", required: true, validate: mustBeHttpsUrl },
  { name: "RESEND_API_KEY", required: true },
  { name: "RESEND_FROM_EMAIL", required: true, validate: mustLookLikeEmail },
  { name: "WHATSAPP_PHONE_NUMBER_ID", required: true },
  { name: "WHATSAPP_ACCESS_TOKEN", required: true },
  { name: "WHATSAPP_VERIFY_TOKEN", required: true },
  { name: "WHATSAPP_APP_SECRET", required: true },
  { name: "WHATSAPP_BUSINESS_ACCOUNT_ID", required: true },
  { name: "NEXT_PUBLIC_MAPBOX_TOKEN", required: true },
  { name: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", required: true },
  { name: "CRON_SECRET", required: true, validate: mustBeLongSecret },
];

const warnings: string[] = [];
const failures: string[] = [];

for (const check of requiredChecks) {
  const value = process.env[check.name]?.trim() ?? "";
  if (check.required && !value) {
    failures.push(`${check.name} is required.`);
    continue;
  }
  if (value && check.validate) {
    const problem = check.validate(value);
    if (problem) failures.push(`${check.name}: ${problem}`);
  }
}

if (process.env["NODE_ENV"] && process.env["NODE_ENV"] !== "production") {
  warnings.push("NODE_ENV is not production. Vercel sets this automatically during production runtime.");
}

if (process.env["WHATSAPP_ACCESS_TOKEN"] === "simulated") {
  failures.push("WHATSAPP_ACCESS_TOKEN must be a real production token, not simulated.");
}

if (failures.length > 0) {
  console.error("[check-production-env] failed");
  for (const failure of failures) console.error(`- ${failure}`);
  if (warnings.length > 0) {
    console.error("\nWarnings:");
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log("[check-production-env] ok");
if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

function mustBeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "must be an https URL.";
    return null;
  } catch {
    return "must be a valid URL.";
  }
}

function mustBeProductionDatabaseUrl(value: string): string | null {
  if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
    return "must be a Postgres connection string.";
  }
  if (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("postgres:rex@")
  ) {
    return "must not point to a local development database.";
  }
  return null;
}

function mustStartWith(prefix: string): (value: string) => string | null {
  return (value) => (value.startsWith(prefix) ? null : `must start with ${prefix}.`);
}

function mustLookLikeEmail(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? null
    : "must look like an email address.";
}

function mustBeLongSecret(value: string): string | null {
  return value.length >= 24 ? null : "must be at least 24 characters.";
}
