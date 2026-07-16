import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray package-lock.json higher up (e.g. in the home directory) makes
  // Next guess the wrong workspace root and warn on every build. Pin it.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
