import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // @x402/next loads Bazaar validation dynamically in the Node.js route.
  serverExternalPackages: ["@x402/extensions"],
};

export default nextConfig;
