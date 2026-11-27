/* The member Home address page and its post over the storefront API (TWCinc negosyoonline_storefront/site_views.py _address_get and
   _address_post). Same rules as account-flow.ts: the member session is this server's cookie passed as data; a 401 clears it and goes
   to the store home; a rejected order locks the dashboard to Home; a 404 is the neutral page.

   The page's address is read from the member's own address route (POST member/address/read/): the saved address and whether a recovery
   hold locks it. It needs no catalog and no member price. The save is the checkout editor's call. */
import { MEMBER, clearCookie } from "./cookies.ts";
import { lockedHome, session, type Dash } from "./dashboard-flow.ts";
import { htmlResponse } from "./html.ts";
import { redirect } from "./member.ts";
import { readHomeAddress, saveHomeAddress, withZip, type Address } from "./shop-api.ts";
import { MSG_ADDRESS_LOCKED, MSG_ADDRESS_NOT_SAVED, MSG_CHECK_FIELDS } from "./shop-flow-text.ts";
import { chrome, memberDocument } from "../views/sante/member.ts";
import { ADDRESS_PAGE_PATH, EMPTY_ADDRESS, addressContent, type AddressPage } from "../views/sante/member-address.ts";

const SCRIPTS = ["js/pack-dashboard.js", "js/pack-address.js"];
const STYLES = ["css/pack-picker.css"];

function signedOut(d: Dash): Response {
  const response = redirect("/");
  clearCookie(response, d.call.request, MEMBER);
  return response;
}

const NONE: AddressPage = { address: { ...EMPTY_ADDRESS }, field_errors: {}, error_message: "", saved: false, locked: false, unreadable: false };

function page(d: Dash, name: string, p: AddressPage, status = 200): Response {
  return htmlResponse(memberDocument(chrome(d.site, d.now), { title: "Home address", member: name, current: "account", content: addressContent(p), scripts: SCRIPTS, styles: STYLES }), status);
}

/** The saved address and whether it is locked. "unreadable" when the read fails (older backend, passing fault, dead session): the page then
    offers no form, so nobody overwrites an address they cannot see. */
async function savedAddress(d: Dash): Promise<{ address: Address | null; locked: boolean } | "unreadable"> {
  const r = await readHomeAddress({ host: d.call.host, visitor_ip: d.call.visitor_ip, member_token: d.call.member_token }, d.calls);
  return r.state === "ok" ? { address: r.address, locked: r.locked } : "unreadable";
}

type Gate = { name: string } | { response: Response };

async function gate(d: Dash): Promise<Gate> {
  const s = await session(d);
  if ("response" in s) return { response: s.response };
  const locked = await lockedHome(d);
  if (locked) return { response: locked };
  return { name: s.member.full_name };
}

export async function addressGet(d: Dash): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const saved = await savedAddress(d);
  if (saved === "unreadable") return page(d, g.name, { ...NONE, unreadable: true });
  const justSaved = new URL(d.call.request.url).searchParams.get("saved") === "1";
  return page(d, g.name, { ...NONE, address: { ...(saved.address ?? EMPTY_ADDRESS) }, locked: saved.locked, saved: justSaved && !saved.locked });
}

export async function addressPost(d: Dash, text: Record<string, string>): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const t = (k: string) => (text[k] ?? "").trim();
  const typed: Address = { line: t("line"), barangay: t("barangay"), city: t("city"), province: t("province"), zip: t("zip"), landmark: t("landmark") };
  const was = typed.zip ? null : await savedAddress(d);
  const address = await withZip(typed, was === null || was === "unreadable" ? null : was.address, d.call, d.calls);
  const r = await saveHomeAddress({ host: d.call.host, visitor_ip: d.call.visitor_ip, member_token: d.call.member_token, address }, d.calls);
  if (r.state === "ok") return redirect(`${ADDRESS_PAGE_PATH}?saved=1`);
  const again = { ...NONE, address: { ...address } };
  // An older backend has no such route (404) and a failed call may be a passing fault: the form stays with what was typed.
  if (r.state === "unavailable" || r.state === "failed") return page(d, g.name, { ...again, error_message: MSG_ADDRESS_NOT_SAVED }, 503);
  if (r.status === 401) return signedOut(d);
  if (r.code === "address_locked") return page(d, g.name, { ...again, locked: true, error_message: r.message || MSG_ADDRESS_LOCKED }, 423);
  if (r.code === "invalid_address") return page(d, g.name, { ...again, field_errors: r.fields, error_message: MSG_CHECK_FIELDS }, 400);
  return page(d, g.name, { ...again, field_errors: r.fields, error_message: r.message || MSG_ADDRESS_NOT_SAVED }, r.status === 429 ? 429 : 400);
}
