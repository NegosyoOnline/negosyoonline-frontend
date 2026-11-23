/* The member Training pages and the one post (backend apps/training/api.py), after TWCinc's University views
   (app/university/views/course.py). Same rules as the Home and My Purchases (src/lib/dashboard-flow.ts): a dead session clears the
   cookie and goes to the store home; a rejected order goes to My Purchases; a 404 is the neutral page; a read that fails shows
   "try again". A locked lesson (409) is a plain message, never the lesson. */
import { htmlResponse } from "./html.ts";
import { memberCourse, memberCourses, memberLesson, memberLessonWatch, memberLive } from "./training-api.ts";
import { lockedHome, session, signedOut, tryAgain, type Dash } from "./dashboard-flow.ts";
import type { PackResult } from "./pack-api.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { chrome, memberDocument } from "../views/sante/member.ts";
import { TRAINING_ID, courseContent, lessonContent, lockedContent, playerSrc, universityContent } from "../views/sante/training.ts";
import type { Markup } from "./html.ts";

/** The script that posts how far a member has watched a Stream lesson (it loads Player.js itself, like pack-visit.js). */
export const WATCH_SCRIPT = "js/lesson-watch.js";

const args = (d: Dash) => ({ host: d.call.host, token: d.call.member_token });

/** The page for a signed-in member, or the answer that ends the request. */
async function gate(d: Dash): Promise<{ name: string } | { response: Response }> {
  const s = await session(d);
  if ("response" in s) return s;
  const locked = await lockedHome(d);
  return locked ? { response: locked } : { name: s.member.full_name };
}

function document(d: Dash, name: string, title: string, content: Markup, status = 200, scripts: string[] = []): Response {
  return htmlResponse(memberDocument(chrome(d.site, d.now), { title, member: name, current: "training", content, scripts }), status);
}

/** What a failed read becomes: signed out, not found, or try again. */
function ended(d: Dash, r: Exclude<PackResult<unknown>, { state: "ok" }>): Response {
  if (r.state === "refused" && r.status === 401) return signedOut(d);
  if (r.state === "unavailable") return neutralNotFound();
  return tryAgain();
}

/** GET /dashboard/training/: the University home. */
export async function trainingPage(d: Dash): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const [courses, live] = await Promise.all([memberCourses(args(d), d.calls), memberLive(args(d), d.calls)]);
  if (courses.state !== "ok") return ended(d, courses);
  if (live.state === "refused" && live.status === 401) return signedOut(d);
  return document(d, g.name, "Training", universityContent(live.state === "ok" ? live.live : null, courses.resume, courses.courses, d.now));
}

/** GET /dashboard/training/<course>/. */
export async function coursePage(d: Dash, id: string): Promise<Response> {
  if (!TRAINING_ID.test(id)) return neutralNotFound();
  const g = await gate(d);
  if ("response" in g) return g.response;
  const r = await memberCourse({ ...args(d), id }, d.calls);
  if (r.state !== "ok") return ended(d, r);
  return document(d, g.name, r.course.title, courseContent(r.course));
}

/** GET /dashboard/training/lesson/<id>/. `courseHint` is the ?c= of the link the member followed, used only for the way back from a locked lesson. */
export async function lessonPage(d: Dash, id: string, courseHint = ""): Promise<Response> {
  if (!TRAINING_ID.test(id)) return neutralNotFound();
  const g = await gate(d);
  if ("response" in g) return g.response;
  const r = await memberLesson({ ...args(d), id }, d.calls);
  if (r.state === "refused" && r.status === 409) return document(d, g.name, "Lesson locked", lockedContent(courseHint), 409);
  if (r.state !== "ok") return ended(d, r);
  const watched = r.lesson.video.kind === "stream" && playerSrc(r.lesson) !== "";
  return document(d, g.name, r.lesson.title, lessonContent(r.lesson), 200, watched ? [WATCH_SCRIPT] : []);
}

const json = (body: Record<string, unknown>, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

/** POST /dashboard/training/lesson/<id>/watch/: the player script's `{percent}` (a whole number, 0 to 100) and, at the end of the video, `ended: true`,
    passed on to the API, which keeps the highest and completes the lesson itself at 90 or more (or on `ended`). The answer is JSON for the script:
    200 {percent, completed, next_unlocked, next_lesson_id}, 401 signed out, 409 locked, 429 slow down, 400 a bad body, 503 try again. */
export async function lessonWatchPost(d: Dash, id: string): Promise<Response> {
  if (!TRAINING_ID.test(id)) return neutralNotFound();
  if (!d.call.member_token) return json({ error: "signed_out" }, 401);
  let percent: unknown;
  let ended: unknown;
  try {
    const body: unknown = await d.call.request.json();
    const o = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    percent = o.percent;
    ended = o.ended;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100) return json({ error: "bad_request" }, 400);
  if (ended !== undefined && typeof ended !== "boolean") return json({ error: "bad_request" }, 400);
  const r = await memberLessonWatch({ ...args(d), id, percent, ...(ended === true ? { ended: true } : {}) }, d.calls);
  if (r.state === "ok") return json({ percent: r.percent, completed: r.completed, next_unlocked: r.next_unlocked, next_lesson_id: r.next_lesson_id || null }, 200);
  if (r.state === "unavailable") return neutralNotFound();
  if (r.state === "refused") return json({ error: "refused" }, [401, 409, 429].includes(r.status) ? r.status : 400);
  return json({ error: "failed" }, 503);
}
