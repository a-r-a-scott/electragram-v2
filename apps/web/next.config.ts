import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@electragram/ui", "@electragram/types"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
