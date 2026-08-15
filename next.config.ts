import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // TODO: Remove ignoreBuildErrors after fixing ~400 TS errors across 55 files.
  // Most errors are "user is possibly null" from getAuthUser() destructuring —
  // needs a type-safe getAuthUser() wrapper that uses type narrowing.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
