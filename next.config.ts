import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pg"],
  // output: "standalone" removed — Vercel handles its own optimised build
};

export default nextConfig;
