import type { NextConfig } from "next";

const r2PublicHost = process.env["R2_PUBLIC_URL"]
  ? new URL(process.env["R2_PUBLIC_URL"]).hostname
  : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "**.r2.dev" },
      ...(r2PublicHost
        ? [{ protocol: "https" as const, hostname: r2PublicHost }]
        : []),
    ],
  },
  experimental: {
    // Default es 1MB; subimos a 8MB para cubrir MAX_PROPERTY_PHOTO_SIZE_BYTES.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
