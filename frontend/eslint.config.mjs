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
    "next-env.d.ts",
  ]),
  {
    files: ["src/**/*.{tsx,jsx}"],
    ignores: [
      "src/components/auth/orcid-button.tsx",
      "src/components/ui/circular-progress.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "JSXOpeningElement[name.name='svg']",
          message:
            "Prefer lucide-react icons over inline <svg>. Exceptions: brand logos, dynamic graphics (progress rings, charts), and test fixtures.",
        },
      ],
    },
  },
]);

export default eslintConfig;
