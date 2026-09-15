import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.0.0.83"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./app/_tools/**/prompts/*.md"],
  },
};

export default nextConfig;
