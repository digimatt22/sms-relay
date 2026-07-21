import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["192.168.68.101"],
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
