import { configScript } from "@/lib/hq-env.mjs";

/* Serves /assets/js/config.js, the one address the static pages load first. Made at build time from
   HQ_STAFF_API_BASE (see src/lib/hq-env.mjs). It contains no secrets, and no request data reaches it. */

const body = configScript(process.env);

export function GET() {
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
