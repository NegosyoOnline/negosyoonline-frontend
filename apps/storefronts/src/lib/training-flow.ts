/* The member Training pages and the one post (backend apps/training/api.py), after TWCinc's University views
   (app/university/views/course.py). Same rules as the Home and My Purchases (src/lib/dashboard-flow.ts): a dead session clears the
   cookie and goes to the store home; a rejected order goes to My Purchases; a 404 is the neutral page; a read that fails shows
   "try again". A locked lesson (409) is a plain message, never the lesson. */
import { htmlResponse } from "./html.ts";
import { memberCourse, memberCourses, memberLesson, memberLessonComplete, memberLive } from "./training-api.ts";
import { lockedHome, session, signedOut, tryAgain, type Dash } from "./dashboard-flow.ts";
import { redirect } from "./member.ts";
import type { PackResult } from "./pack-api.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { chrome, memberDocument } from "../views/sante/member.ts";
import { TRAINING_ID, TRAINING_PATH, courseContent, lessonContent, lessonHref, lockedContent, universityContent } from "../views/sante/training.ts";
import type { Markup } from "./html.ts";

const args = (d: Dash) => ({ host: d.call.host, token: d.call.member_token });

/** The page for a signed-in member, or the answer that ends the request. */
async function gate(d: Dash): Promise<{ name: string } | { response: Response }> {
  const s = await session(d);
  if ("response" in s) return s;
  const locked = await lockedHome(d);
  return locked ? { response: locked } : { name: s.member.full_name };
}

function document(d: Dash, name: string, title: string, content: Markup, status = 200): Response {
  return htmlResponse(memberDocument(chrome(d.site, d.now), { title, member: name, current: "training", content, scripts: [] }), status);
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
  return document(d, g.name, r.lesson.title, lessonContent(r.lesson));
}

/** POST /dashboard/training/lesson/<id>/complete/: marks the lesson complete, then shows it again. */
export async function lessonCompletePost(d: Dash, id: string): Promise<Response> {
  if (!TRAINING_ID.test(id)) return neutralNotFound();
  const g = await gate(d);
  if ("response" in g) return g.response;
  const r = await memberLessonComplete({ ...args(d), id }, d.calls);
  if (r.state === "refused" && r.status === 409) return document(d, g.name, "Lesson locked", lockedContent(""), 409);
  if (r.state !== "ok") return ended(d, r);
  return redirect(r.done.course_id ? lessonHref(id, r.done.course_id) : `${TRAINING_PATH}lesson/${encodeURIComponent(id)}/`);
}
