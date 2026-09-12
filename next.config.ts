import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Prisma client and pg driver run on the server only.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  agentRules: false,
};

export default nextConfig;
