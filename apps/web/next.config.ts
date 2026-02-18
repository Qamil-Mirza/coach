import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@coach/shared", "@coach/db", "@coach/integrations", "@coach/ai", "@coach/observability"],
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
