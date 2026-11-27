import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export for GitHub Pages (built into ./out).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // dev only: lets a phone on the same Wi-Fi open the dev server (http://<this Mac's IP>:3000)
  allowedDevOrigins: ["192.168.1.126", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
