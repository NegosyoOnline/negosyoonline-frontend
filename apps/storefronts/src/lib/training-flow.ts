/* The member Training pages, /dashboard/training/ and its three module pages. Member only, per site: the member session is this
   host's cookie, checked by Django for this host (a session of another site is a 401 here and goes to the store home). A rejected
   order locks the dashboard to Home like every other member page. Read only: no order, no cart, no price. */
import { lockedHome, session, type Dash } from "./dashboard-flow.ts";
import { htmlResponse, type Markup } from "./html.ts";
import { fetchCatalog } from "./shop-api.ts";
import { chrome, memberDocument } from "../views/sante/member.ts";
import { mobileAppPage, productTrainingsPage, trainingIndex, waysToEarnPage } from "../views/sante/training.ts";

async function trainingPage(d: Dash, title: string, render: (name: string) => Promise<Markup> | Markup): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const locked = await lockedHome(d);
  if (locked) return locked;
  const name = s.member.full_name;
  const content = await render(name);
  return htmlResponse(memberDocument(chrome(d.site, d.now), { title, member: name, current: "training", content, scripts: [] }));
}

export const trainingHome = (d: Dash) => trainingPage(d, "Training", (n) => trainingIndex(n));
export const trainingMobileApp = (d: Dash) => trainingPage(d, "How to use the Santé Mobile App", (n) => mobileAppPage(n));
export const trainingWaysToEarn = (d: Dash) => trainingPage(d, "Ways to Earn in Santé", (n) => waysToEarnPage(n));
export const trainingProducts = (d: Dash) =>
  trainingPage(d, "Product Trainings", async (n) => productTrainingsPage(n, await fetchCatalog(d.call.host, d.calls)));

