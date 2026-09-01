import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Several lockfiles live above this directory; pin the trace root so the
  // build does not guess.
  outputFileTracingRoot: path.join(__dirname),
  eslint: {
    dirs: ["src"],
  },
};

export default nextConfig;
