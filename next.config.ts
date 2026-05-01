import type { NextConfig } from "next";

const r2PublicHost = process.env["R2_PUBLIC_URL"]
  ? new URL(process.env["R2_PUBLIC_URL"]).hostname
  : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      ...(r2PublicHost
        ? [{ protocol: "https" as const, hostname: r2PublicHost }]
        : []),
    ],
  },
};

export default nextConfig;
