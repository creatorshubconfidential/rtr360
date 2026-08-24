import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "pdfkit"],
};

export default nextConfig;
