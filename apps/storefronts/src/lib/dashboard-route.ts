/* What the dashboard post routes share: a served Santé site, the call of the request, and the post guard. A post from
   another site, or from nowhere, is refused before anything is read. */
import type { Dash } from "./dashboard-flow.ts";
import { callFor, forbidden, postIsSameOrigin } from "./member.ts";
import { siteFor } from "./site.ts";
import { neutralNotFound } from "../views/neutral.ts";

export async function dashFor(request: Request): Promise<Dash | null> {
  const site = await siteFor(request);
  if (!site) return null;
  const call = callFor(request);
  return { site, call, calls: { env: call.env } };
}

export async function dashGet(request: Request, run: (d: Dash) => Promise<Response>): Promise<Response> {
  const d = await dashFor(request);
  return d ? run(d) : neutralNotFound();
}

export async function dashPost(request: Request, run: (d: Dash, form: FormData) => Promise<Response>): Promise<Response> {
  const d = await dashFor(request);
  if (!d) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return neutralNotFound();
  }
  return run(d, form);
}

export function textOf(form: FormData): Record<string, string> {
  const text: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") text[key] = value;
  return text;
}

export const others = { PUT: neutralNotFound, PATCH: neutralNotFound, DELETE: neutralNotFound, OPTIONS: neutralNotFound };
