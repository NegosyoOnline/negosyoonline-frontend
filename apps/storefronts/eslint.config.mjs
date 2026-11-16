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
    // pdf.js, vendored unchanged for the Membership Terms popup (public/agreement-viewer/VERSION in TWCinc): not our code.
    "public/agreement-viewer/**",
    // Player.js v0.0.11, vendored unchanged for the landing video marks (ClickUp z8uq9mfw14): not our code.
    "public/assets/sante/js/player.min.js",
  ]),
]);

export default eslintConfig;
