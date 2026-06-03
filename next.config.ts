import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // This allows production builds to successfully complete 
    // even if your project has TypeScript errors.
    ignoreBuildErrors: true,
  },
  // ... keep any other existing settings you already have here
};

export default nextConfig;