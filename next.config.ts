import type { NextConfig } from "next";

const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
const allowLocalIp =
  process.env.IMAGES_ALLOW_LOCAL_IP === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.IMAGES_ALLOW_LOCAL_IP !== "false");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.protocol.replace(":", "") as "http" | "https",
        hostname: apiUrl.hostname,
        port: apiUrl.port,
        pathname: "/uploads/**",
      },
    ],
    dangerouslyAllowLocalIP: allowLocalIp,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
