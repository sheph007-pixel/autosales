import { execSync } from "child_process";

let gitHash = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "dev";
try {
  if (gitHash === "dev") {
    gitHash = execSync("git rev-parse --short HEAD").toString().trim();
  }
} catch {}

const buildTime = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" });

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@autosales/db", "@autosales/core", "@autosales/ai", "@autosales/mail"],
  experimental: {
    serverComponentsExternalPackages: ["pg-boss", "postgres"],
    instrumentationHook: true,
  },
  env: {
    BUILD_VERSION: gitHash,
    BUILD_TIME: buildTime,
    NEXT_PUBLIC_BUILD_VERSION: gitHash,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
};

export default nextConfig;
