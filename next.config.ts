import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export for GitHub Pages (built into ./out).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
