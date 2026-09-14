import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One self-contained folder for the container (see Dockerfile).
  output: "standalone",
  // The Prisma client and pg driver run on the server only.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  agentRules: false,
  poweredByHeader: false,
  devIndicators: false,
  experimental: {
    // Uploads go through server actions. The default 1 MB cap rejected ordinary photos and PDFs
    // before the app could say anything. Cloud Run refuses requests over 32 MB, so stay under it;
    // the file pickers check sizes in the browser first and explain the limit.
    serverActions: { bodySizeLimit: "30mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
