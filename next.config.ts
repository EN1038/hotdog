import type { NextConfig } from "next";
import path from "path";

// Always the app root at runtime (works on DigitalOcean / CI / local).
// Avoid __dirname / import.meta — next may load this config from a temp path.
const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  // Pin tooling to this app when a parent folder also has a lockfile
  outputFileTracingRoot: projectRoot,
  // Allow opening the app via 127.0.0.1 during local development
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "skillsale.sgp1.digitaloceanspaces.com",
        pathname: "/**",
      },
    ],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        // Avoid watching the entire home directory (EMFILE / broken HMR)
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/Library/**",
          "**/Movies/**",
          "**/Music/**",
          "**/Pictures/**",
          "**/Downloads/**",
          "**/Documents/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
