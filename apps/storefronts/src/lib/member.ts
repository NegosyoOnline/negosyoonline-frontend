/* What the member routes share: the answers they give, and the host, address and cookies of a request.
   Every member page is no-store and noindex, and every redirect carries no body. */
import { storefrontEnv } from "./env.ts";
import { MEMBER, MEMBER_PRE, readMemberCookie, sameOriginPost } from "./cookies.ts";
import { requestHost } from "./site.ts";
import { visitorIp } from "./visitor.ts";
import { neutralDocument } from "../views/neutral.ts";
import { htmlResponse } from "./html.ts";
import { memberMe } from "./django.ts";

export function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { Location: location, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

/** A post from somewhere else, or from nowhere. */
export function forbidden(): Response {
  return htmlResponse(neutralDocument("Forbidden."), 403);
}

export type Call = {
  request: Request;
  host: string;
  visitor_ip: string;
  member_token: string;
  binding: string;
  env: ReturnType<typeof storefrontEnv>;
};

export function callFor(request: Request): Call {
  return {
    request,
    host: requestHost(request),
    visitor_ip: visitorIp(request.headers),
    member_token: readMemberCookie(request, MEMBER),
    binding: readMemberCookie(request, MEMBER_PRE),
    env: storefrontEnv(),
  };
}

export function postIsSameOrigin(request: Request): boolean {
  return sameOriginPost(request, request.headers.get("host") ?? "");
}

/** The box shows 9XX XXX XXXX after a fixed +63: the digits are read as pack-phone.js reads them and sent as +63.
    An email typed in is sent as it is (Django reads an "@" as an email). */
export function contactOf(raw: string): string {
  const value = raw.trim();
  if (value.includes("@")) return value;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("639")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits ? `+63${digits}` : "";
}

/** Whether this request carries a live member session: the server-side cookie check, no script. Any failure reads as signed out. */
export async function isSignedIn(request: Request, calls: Parameters<typeof memberMe>[1] = { env: storefrontEnv() }): Promise<boolean> {
  const call = callFor(request);
  if (!call.member_token) return false;
  try {
    const me = await memberMe({ host: call.host, token: call.member_token }, { ...calls, log: calls.log ?? (() => {}) });
    return me.state === "ok";
  } catch {
    return false;
  }
}
