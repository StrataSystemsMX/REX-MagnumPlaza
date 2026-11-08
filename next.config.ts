import type { NextConfig } from "next";

const storagePublicUrl = process.env["STORAGE_PUBLIC_URL"] || process.env["R2_PUBLIC_URL"];
const storagePublicHost = storagePublicUrl ? new URL(storagePublicUrl).hostname : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.supabase.co" },
      ...(storagePublicHost
        ? [{ protocol: "https" as const, hostname: storagePublicHost }]
        : []),
    ],
  },
  experimental: {
    // Default es 1MB; subimos a 8MB para cubrir MAX_PROPERTY_PHOTO_SIZE_BYTES.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
