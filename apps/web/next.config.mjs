/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@autosales/db", "@autosales/core", "@autosales/ai", "@autosales/mail"],
  experimental: {
    serverComponentsExternalPackages: ["pg-boss", "postgres"],
  },
};

export default nextConfig;
