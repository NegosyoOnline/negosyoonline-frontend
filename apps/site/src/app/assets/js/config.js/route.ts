import { siteEnv } from "@/lib/site-env";

/* Serves /assets/js/config.js, the deployment configuration the static pages load first.
   The URLs come from environment variables (see src/lib/site-env.ts); it contains no secrets. */

const BLOB = "https://pemdcws76uzmwk7c.public.blob.vercel-storage.com/site";

const config = {
  /* Shows the Monthly/Annual toggle and annual pricing (Coach Ed 2026-10-29: Annual is shown, not hidden). */
  ANNUAL_PLAN_ENABLED: true,
  apiBase: siteEnv.apiBase,
  siteUrl: siteEnv.siteUrl,
  dashUrl: siteEnv.dashUrl,
  googleSignIn: siteEnv.googleSignIn,
  /* Final separately stored images live in Vercel Blob. An empty value renders a clearly marked
     placeholder instead of a stock or generated image. */
  assets: {
    logoReversed: `${BLOB}/brand/negosyoonline-wordmark-reversed.svg`,
    hero: `${BLOB}/home/negosyoonline-home-hero-storefront.webp`,
    founder: `${BLOB}/team/negosyoonline-founder-ed-geronilla.webp`,
    solutionOrganized: `${BLOB}/home/negosyoonline-solution-organized-platform.webp`,
    solutionClearPath: `${BLOB}/home/negosyoonline-solution-clear-path.webp`,
    solutionSupport: `${BLOB}/home/negosyoonline-solution-support.webp`,
  },
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
