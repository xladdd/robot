import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "public/**",
    "map-test-results/**",
    "app/content/design-manual/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // These effects intentionally hydrate persisted UI state and synchronize
      // derived editor output. Changing them would alter established behavior.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
