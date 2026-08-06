import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Absolute project dir even when a parent lockfile exists under $HOME
const projectRoot =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin tooling to this app (not sibling lockfiles under home)
  outputFileTracingRoot: projectRoot,
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
