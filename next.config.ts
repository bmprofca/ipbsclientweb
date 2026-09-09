import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ipbs/shared"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      dgram: false,
    };
    return config;
  },
};

export default nextConfig;
