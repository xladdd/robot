import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.0.0.83"],
  outputFileTracingIncludes: {
    "/": [
      "./app/_tools/**/info.*.md",
      "./app/_tools/design-manual/manual.*.md",
    ],
    "/api/**/*": ["./app/_tools/**/prompts/*.md"],
  },
};

export default nextConfig;
