import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb"
    }
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com"
      },
      {
        protocol: "https",
        hostname: "public.bnbstatic.com"
      },
      {
        protocol: "https",
        hostname: "bin.bnbstatic.com"
      },
      {
        protocol: "https",
        hostname: "public.nftstatic.com"
      }
    ]
  },
  outputFileTracingIncludes: {
    "/legacy/*": [
      "./*.html",
      "./*.css",
      "./*.js",
      "./assets/**/*",
      "./data/**/*"
    ],
    "/classic-grid-console": ["./classic-grid/public/index.html"],
    "/api/classic-grid/*": ["./classic-grid/**/*"],
    "/grid-ops-hosted-console": ["./grid-ops/public/index.html"],
    "/api/grid-ops-hosted/*": ["./grid-ops/**/*"]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" }
        ]
      }
    ];
  }
};

export default withWorkflow(nextConfig);
