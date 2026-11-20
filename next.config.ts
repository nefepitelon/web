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
    "/hedge-ops/console/**": [
      "./hedge-ops/engines/lighter/src/parallax_hedge/web/index.html",
      "./hedge-ops/paired_hedge/web/**/*",
      "./hedge-ops/binance_lighter/web/index.html",
      "./hedge-ops/binance_lighter/web/app.js",
      "./hedge-ops/binance_lighter/web/styles.css",
      "./hedge-ops/engines/lighter/src/parallax_hedge/web/app.js",
      "./hedge-ops/engines/lighter/src/parallax_hedge/web/styles.css",
      "./hedge-ops/engines/entropy/src/parallax_hedge/web/index.html",
      "./hedge-ops/engines/entropy/src/parallax_hedge/web/app.js",
      "./hedge-ops/engines/entropy/src/parallax_hedge/web/styles.css",
    ],
    "/api/alpha-execution/automation": ["./lib/legacy-handlers/surf-research.js", "./grid-ops/src/ai/provider.js", "./grid-ops/src/proxy.js", "./grid-ops/src/exchange/manifest.js"],
    "/quant-suite/*": ["./quant-runtime/recipes/**/*", "./third-party/quant-source/**/*"],
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
  outputFileTracingExcludes: {
    "/api/hedge-ops/**": ["./.runtime/**/*"],
  },
  async rewrites() {
    // Vercel cleanUrls serves each public index.html at its directory URL.
    // An .html rewrite target is absent from its transformed static output;
    // Next's local server still needs the actual public filename.
    const nativeIndex = (engine: string) => process.env.VERCEL === "1"
      ? `/quant-native/${engine}`
      : `/quant-native/${engine}/index.html`;
    return {beforeFiles: [], afterFiles: [], fallback: [
      {source: "/quant-native/freqtrade/:path*", destination: nativeIndex("freqtrade")},
      {source: "/quant-native/jesse/:path*", destination: nativeIndex("jesse")},
    ]};
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
