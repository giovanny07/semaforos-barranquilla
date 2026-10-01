import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site (out/): no server code, no functions. Security headers live in vercel.json,
  // because `headers()` is not available with a static export.
  output: "export",
  // the dev badge sits on top of the sidebar footer link
  devIndicators: false,
};

export default nextConfig;
