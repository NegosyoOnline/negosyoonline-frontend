/* The staff app's one address. No secrets: anything a page can read is public (design 21.2).
   The default is the staging hq host, so a deploy with no variable set never talks to production.
   Production must set HQ_STAFF_API_BASE in its Vercel project. Read at build time. */

const STAGING_STAFF_API = "https://hq-staging.negosyonline.com/staff/v1";

export function readEnv(env) {
  const staffApi = String(env.HQ_STAFF_API_BASE || STAGING_STAFF_API).trim().replace(/\/+$/, "");
  return { staffApi, staffApiOrigin: new URL(staffApi).origin };
}

/* Script, styles and the font from this app only; calls to the one staff address only; no frame. */
export function buildCsp(staffApiOrigin) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    `connect-src ${staffApiOrigin}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function configScript(env) {
  const config = { staffApi: readEnv(env).staffApi };
  return `/* Deployment configuration. Generated from environment variables; contains no secrets. */
window.NO_HQ_CONFIG = ${JSON.stringify(config, null, 2)};
`;
}
