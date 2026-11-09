import { siteEnv } from "@/lib/site-env";

/* Serves /assets/js/config.js, the deployment configuration the static pages load first.
   The URLs come from environment variables (see src/lib/site-env.ts); it contains no secrets. */

const config = {
  apiBase: siteEnv.apiBase,
  siteUrl: siteEnv.siteUrl,
  dashUrl: siteEnv.dashUrl,
};

const body = `/* Deployment configuration. Generated from environment variables; contains no secrets. */
window.NO_CONFIG = ${JSON.stringify(config, null, 2)};
`;

export function GET() {
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
