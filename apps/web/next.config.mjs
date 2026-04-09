import { execSync } from "child_process";

let gitHash = "dev";
try {
  gitHash = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@autosales/db", "@autosales/core", "@autosales/ai", "@autosales/mail"],
  experimental: {
    serverComponentsExternalPackages: ["pg-boss", "postgres"],
  },
  env: {
    BUILD_VERSION: gitHash,
    BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_BUILD_VERSION: gitHash,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
