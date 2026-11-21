/* The member Training pages (ClickUp z8uq9mezdj): the University home, the course page, the lesson player, "Mark complete",
   and the Home slots. The Django answers are faked with the backend's shapes (apps/training/api.py). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { homePage, type Dash } from "../src/lib/dashboard-flow.ts";
import { WATCH_SCRIPT, coursePage, lessonCompletePost, lessonPage, lessonWatchPost, trainingPage } from "../src/lib/training-flow.ts";
import { durationText, embedUrl, liveWhen, resumeCard } from "../src/views/sante/training.ts";
import nextConfig from "../next.config.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;
const TOKEN = "M".repeat(43);

type Reply = { status: number; body: unknown };
function fake(replies: Record<string, Reply[]>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/(\?.*)?$/, "");
    calls.push({ path: route, body: init.body === undefined ? {} : JSON.parse(String(init.body)) });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}
function dashOf(f: ReturnType<typeof fake>, token = TOKEN, request = new Request("http://www.santetest.com/dashboard/training/")): Dash {
  return {
    site: SITE, now: new Date("2026-11-14T00:00:00Z"), appUrl: "",
    call: { request, host: "demo.negosyotest.com", visitor_ip: "", member_token: token, binding: "", env },
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} },
  };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code = "x"): Reply => ({ status, body: { error: { code, message: "x" } } });
const ME = ok({ member: { id: "m1", full_name: "Juan Dela Cruz", email: "j@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } });
const FREE = ok({ pack: null, registration: null });
const LOCKED = ok({ pack: { order_number: "SP-1", payment_status: "rejected", payment_label: "Needs attention", method_label: "Bank transfer", price_centavos: 100, tone: "att", benefits_off: true, proofs: [],
  lock: { reason_label: "Amount does not match", other_text: "", resubmitted: false, accounts: [] } }, registration: null });
const BLOB = "https://abc123.public.blob.vercel-storage.com/training/a.png";

const COURSE = (over: Record<string, unknown> = {}) => ({ id: "crs_1", slug: "app", title: "How to use the <App>", description: "Start here.", image_url: BLOB, order: 1, coming_soon: false, completed_lessons: 1, total_lessons: 4, percent: 25, module_count: 2, ...over });
const SOON = COURSE({ id: "crs_2", slug: "earn", title: "Ways to Earn", description: "", image_url: null, coming_soon: true, completed_lessons: 0, total_lessons: 0, percent: 0, module_count: 0 });
const RESUME = { course: { id: "crs_1", title: "How to use the <App>" }, id: "lsn_2", title: "Place an order" };
const LIVE = { id: "liv_1", title: "Weekly <Q&A>", starts_at: "2026-11-20T11:00:00Z", duration_minutes: 90, description: "Bring questions.", join_url: "https://meet.example.test/room", thumbnail_url: BLOB };
const YT = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const ROW = (id: string, over: Record<string, unknown> = {}) => ({ id, title: `Lesson ${id}`, duration: "5:00", image_url: null, completed: false, locked: false, ...over });
const DETAIL = COURSE({
  modules: [
    { id: "mdl_1", title: "Basics", order: 1, module_number: 1, completed_lessons: 1, total_lessons: 2, lessons: [ROW("lsn_1", { completed: true }), ROW("lsn_2")] },
    { id: "mdl_2", title: "Orders", order: 2, module_number: 2, completed_lessons: 0, total_lessons: 2, lessons: [ROW("lsn_3", { locked: true }), ROW("lsn_4", { locked: true })] },
  ],
  next_lesson: { id: "lsn_2", title: "Lesson lsn_2" },
});
const LESSON = (over: Record<string, unknown> = {}) => ({
  id: "lsn_2", title: "Place <an> order", duration: "6:30", description: "Watch how.", video_url: YT, image_url: null, completed: false,
  course: { id: "crs_1", title: "How to use the <App>" }, module: { id: "mdl_1", title: "Basics", module_number: 1 },
  lessons: [ROW("lsn_1", { completed: true }), ROW("lsn_2")], previous_lesson: { id: "lsn_1", title: "Lesson lsn_1" },
  next_lesson: { id: "lsn_3", title: "Lesson lsn_3" }, next_lesson_locked: true,
  previous_module: null, next_module: { id: "mdl_2", title: "Orders", first_lesson_id: "lsn_3", module_number: 2 }, ...over,
});
const text = async (r: Response) => r.text();
const mkBase = () => ({ "member/me": [ME], "member/pack": [FREE] });

/* ---- the University home ----------------------------------------------------------------------------------------- */

test("the home lists the courses with progress, the Coming Soon course without a link, the next live card and where to pick up", async () => {
  const f = fake({ ...mkBase(), "member/training/courses": [ok({ courses: [COURSE(), SOON], resume: RESUME })], "member/training/live": [ok({ live: LIVE })] });
  const r = await trainingPage(dashOf(f));
  assert.equal(r.status, 200);
  const body = await text(r);
  assert.match(body, /<h1>Training<\/h1>/);
  assert.match(body, /<h2 id="tr-all-h" class="tr-h2">All Courses<\/h2><span>2 courses<\/span>/);
  assert.match(body, /<a class="tr-card tr-cc" href="\/dashboard\/training\/crs_1\/" data-course="crs_1">/);
  assert.ok(body.includes(`src="${BLOB}"`));
  assert.match(body, /How to use the &lt;App&gt;/);
  assert.match(body, /aria-valuenow="25"/);
  assert.match(body, /<b>25%<\/b>/);
  assert.match(body, /1\/4 lessons/);
  assert.match(body, /<span class="tr-chip">4 lessons<\/span>/);
  assert.match(body, /<span data-modules>2 modules<\/span> &middot; 1\/4 lessons/);
  assert.match(body, /tr-btn-full">Continue<\/span>/);
  const soon = body.slice(body.indexOf('data-course="crs_2"') - 40, body.indexOf("</section>", body.indexOf('data-course="crs_2"')));
  assert.match(soon, /<div class="tr-card tr-cc tr-card-off"/);
  assert.match(soon, /Coming Soon/);
  assert.match(soon, /tr-thumb-title">Ways to Earn/);
  assert.doesNotMatch(soon, /href=|tr-btn/);
  // The resume card: the course's progress and a Continue button on the next lesson.
  assert.match(body, /Pick up where you left off/);
  assert.match(body, /<b>25% complete<\/b> &middot; 1 of 4 lessons/);
  assert.match(body, /<a class="tr-btn tr-btn-go" href="\/dashboard\/training\/lesson\/lsn_2\/\?c=crs_1">[\s\S]*Continue<\/a>/);
  assert.match(body, /Next live training/);
  assert.match(body, /<div class="tr-cal" aria-hidden="true"><b>20<\/b><span>Nov<\/span><\/div>/);
  assert.doesNotMatch(body, /Live now/);
  assert.match(body, /Weekly &lt;Q&amp;A&gt;/);
  assert.match(body, /Fri, Nov 20, 2026, 7:00 PM \(Philippine time\)/);
  assert.match(body, /1 hr 30 min/);
  assert.match(body, /<a class="tr-btn tr-btn-gold" href="https:\/\/meet\.example\.test\/room" rel="noopener noreferrer" target="_blank">Join<\/a>/);
  assert.deepEqual(f.calls.find((c) => c.path === "member/training/courses")!.body, { host: "demo.negosyotest.com", token: TOKEN });
});

test("with no live training the card is not there; with no join link there is no Join button; with no resume there is no resume card", async () => {
  const none = await text(await trainingPage(dashOf(fake({ ...mkBase(), "member/training/courses": [ok({ courses: [COURSE()], resume: null })], "member/training/live": [ok({ live: null })] }))));
  assert.doesNotMatch(none, /Next live training|Pick up where you left off|data-tr="live"/);
  const noJoin = await text(await trainingPage(dashOf(fake({ ...mkBase(), "member/training/courses": [ok({ courses: [], resume: null })], "member/training/live": [ok({ live: { ...LIVE, join_url: null } })] }))));
  assert.match(noJoin, /Next live training/);
  assert.doesNotMatch(noJoin, />Join</);
  assert.match(noJoin, /No courses yet/);
  const unsafe = await text(await trainingPage(dashOf(fake({ ...mkBase(), "member/training/courses": [ok({ courses: [], resume: null })], "member/training/live": [ok({ live: { ...LIVE, join_url: "javascript:alert(1)" } })] }))));
  assert.doesNotMatch(unsafe, /javascript:|>Join</);
});

test("a failed live read leaves the page up; a failed courses read says try again; a dead session goes to the store home; a rejected order to My Purchases", async () => {
  const noLive = await trainingPage(dashOf(fake({ ...mkBase(), "member/training/courses": [ok({ courses: [COURSE()], resume: null })], "member/training/live": [err(500)] })));
  assert.equal(noLive.status, 200);
  assert.equal((await trainingPage(dashOf(fake({ ...mkBase(), "member/training/courses": [err(500)], "member/training/live": [ok({ live: null })] })))).status, 503);
  assert.equal((await trainingPage(dashOf(fake({ ...mkBase(), "member/training/courses": [err(404)], "member/training/live": [ok({ live: null })] })))).status, 404);
  const dead = await trainingPage(dashOf(fake({ ...mkBase(), "member/training/courses": [err(401, "member_session_invalid")], "member/training/live": [ok({ live: null })] })));
  assert.equal(dead.headers.get("location"), "/");
  assert.equal((await trainingPage(dashOf(fake({ "member/me": [ME], "member/pack": [LOCKED] })))).headers.get("location"), "/dashboard/purchases/");
  assert.equal((await trainingPage(dashOf(fake({}), ""))).headers.get("location"), "/");
});

test("a live training that is on right now says Live now, with no date block; a finished course gets Review Course and the Completed chip", async () => {
  const f = fake({ ...mkBase(), "member/training/courses": [ok({ courses: [COURSE({ percent: 100, completed_lessons: 4 }), COURSE({ id: "crs_3", title: "Fresh", percent: 0, completed_lessons: 0, total_lessons: 1 })], resume: null })], "member/training/live": [ok({ live: { ...LIVE, starts_at: "2026-11-13T23:30:00Z" } })] });
  const body = await text(await trainingPage(dashOf(f))); // the fake clock reads 2026-11-14T00:00Z: 30 minutes into a 90 minute session
  assert.match(body, /<span class="tr-badge-live"><span class="tr-live-dot"><\/span>Live now<\/span>/);
  assert.match(body, /Streaming now/);
  assert.match(body, />Join the live</);
  assert.doesNotMatch(body, /tr-cal/);
  assert.match(body, /&#10003; Completed/);
  assert.match(body, /tr-btn-full">Review Course<\/span>/);
  assert.match(body, /<span class="tr-chip">1 lesson<\/span>/);
  assert.match(body, /tr-btn-full">Start Course<\/span>/);
});

/* ---- the course page --------------------------------------------------------------------------------------------- */

test("the course page shows each module with n/m, ticks the done lesson, and links only unlocked lessons", async () => {
  const body = await text(await coursePage(dashOf(fake({ ...mkBase(), "member/training/courses/crs_1": [ok(DETAIL)] })), "crs_1"));
  assert.match(body, /<h1>How to use the &lt;App&gt;<\/h1>/);
  assert.match(body, /Module 1: Basics<\/h2><span class="tr-mod-s">2 lessons<\/span><\/span>\s*<span class="tr-count">1 \/ 2<\/span>/);
  assert.match(body, /Module 2: Orders<\/h2><span class="tr-mod-s">2 lessons<\/span><\/span>\s*<span class="tr-count">0 \/ 2<\/span>/);
  // The accordion is a details element: the module with the next lesson is open, the other is not.
  assert.match(body, /<details class="tr-mod" data-module="mdl_1" open>/);
  assert.match(body, /<details class="tr-mod" data-module="mdl_2">/);
  assert.match(body, /<span class="tr-now">Up next<\/span>/);
  assert.match(body, /<a class="tr-ls tr-ls-done" href="\/dashboard\/training\/lesson\/lsn_1\/\?c=crs_1" data-lesson="lsn_1">/);
  assert.match(body, /<a class="tr-ls tr-ls-open" href="\/dashboard\/training\/lesson\/lsn_2\/\?c=crs_1"/);
  for (const id of ["lsn_3", "lsn_4"]) {
    assert.match(body, new RegExp(`<div class="tr-ls tr-ls-lock" data-lesson="${id}">`));
    assert.doesNotMatch(body, new RegExp(`href="[^"]*${id}`));
  }
  assert.match(body, /Continue: Lesson lsn_2/);
});

test("a bad course id never reaches Django; an unknown course is the neutral page", async () => {
  const f = fake(mkBase());
  assert.equal((await coursePage(dashOf(f), "../x")).status, 404);
  assert.equal(f.calls.length, 0);
  assert.equal((await coursePage(dashOf(fake({ ...mkBase(), "member/training/courses/crs_9": [err(404)] })), "crs_9")).status, 404);
});

/* ---- the lesson player ------------------------------------------------------------------------------------------- */

test("the lesson player frames only the allowlisted embed, sandboxed and fullscreen, with the lesson list, module links and a Mark complete form", async () => {
  const body = await text(await lessonPage(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_2": [ok(LESSON())] })), "lsn_2", "crs_1"));
  assert.match(body, /<iframe src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(body, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
  assert.match(body, /allowfullscreen/);
  assert.match(body, /<h1>Place &lt;an&gt; order<\/h1>/);
  assert.match(body, /6:30/);
  assert.match(body, /Watch how\./);
  assert.match(body, /<form method="post" action="\/dashboard\/training\/lesson\/lsn_2\/complete\/"><button type="submit" class="md-app-btn tr-complete">Mark complete<\/button><\/form>/);
  assert.match(body, /aria-current="page"/);
  assert.match(body, /href="\/dashboard\/training\/lesson\/lsn_3\/\?c=crs_1">Next Module 2 &rarr;<\/a>/);
  assert.match(body, /<div class="tr-eyebrow">How to use the &lt;App&gt; &middot; Module 1<\/div>/);
  assert.match(body, /<span class="tr-dis">&larr; Prev Module<\/span>/);
  assert.match(body, /Previous Lesson/);
  assert.match(body, /1 of 2 lessons complete/);
  assert.match(body, /Lesson 2 of 2 &middot; 1 lesson completed in this module/);
  assert.match(body, /class="tr-ring" style="--p:50"/);
  assert.match(body, /<span class="tr-now">Now<\/span>/);
  // Next Lesson is off until this lesson is complete.
  assert.match(body, /<span class="tr-btn tr-btn-off" aria-disabled="true">Next Lesson/);
  assert.doesNotMatch(body, /class="tr-btn tr-btn-go"/);
  assert.match(body, /Back to How to use the &lt;App&gt;/);
});

test("a completed lesson shows Completed instead of the button, and Next Lesson is a link", async () => {
  const body = await text(await lessonPage(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_2": [ok(LESSON({ completed: true, next_lesson_locked: false }))] })), "lsn_2"));
  assert.match(body, /data-tr="completed"/);
  assert.doesNotMatch(body, /Mark complete/);
  assert.match(body, /<a class="tr-btn tr-btn-go" href="\/dashboard\/training\/lesson\/lsn_3\/\?c=crs_1">Next Lesson/);
});

test("a video from another host is not framed", async () => {
  for (const bad of ["https://evil.test/embed/dQw4w9WgXcQ", "http://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://player.vimeo.com:8443/video/123"]) {
    const body = await text(await lessonPage(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_2": [ok(LESSON({ video_url: bad }))] })), "lsn_2"));
    assert.doesNotMatch(body, /<iframe/, bad);
    assert.match(body, /not available yet/);
  }
  assert.equal(embedUrl("https://player.vimeo.com/video/123456?h=abc"), "https://player.vimeo.com/video/123456");
  assert.equal(embedUrl("https://iframe.mediadelivery.net/embed/12345/0a1b2c3d-4e5f-6789"), "https://iframe.mediadelivery.net/embed/12345/0a1b2c3d-4e5f-6789");
  assert.equal(embedUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});

test("a locked lesson (409) shows a plain message with the way back, and no player", async () => {
  const f = fake({ ...mkBase(), "member/training/lessons/lsn_3": [err(409, "lesson_locked")] });
  const r = await lessonPage(dashOf(f), "lsn_3", "crs_1");
  assert.equal(r.status, 409);
  const body = await text(r);
  assert.match(body, /Finish the lesson before this one first\./);
  assert.match(body, /<a class="md-app-btn" href="\/dashboard\/training\/crs_1\/">Back to the course<\/a>/);
  assert.doesNotMatch(body, /<iframe/);
  const noHint = await text(await lessonPage(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_3": [err(409, "lesson_locked")] })), "lsn_3", "<x>"));
  assert.match(noHint, /href="\/dashboard\/training\/">Back to Training/);
});

/* ---- Stream lessons (R2) ------------------------------------------------------------------------------------------ */

const STREAM_EMBED = "https://iframe.mediadelivery.net/embed/816560/0a1b2c3d-4e5f-6789-abcd-0123456789ab";
const STREAM = (over: Record<string, unknown> = {}) => ({ kind: "stream", status: "ready", embed_url: STREAM_EMBED, needs_video: false, ...over });

test("a ready Stream lesson plays the embed the API returns for the lesson's own library, and loads the watch script", async () => {
  const body = await text(await lessonPage(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_2": [ok(LESSON({ video_url: null, video: STREAM() }))] })), "lsn_2", "crs_1"));
  assert.ok(body.includes(`<iframe src="${STREAM_EMBED}"`));
  assert.match(body, /<div class="tr-player" data-lesson-video="lsn_2" data-watch="1">/);
  assert.match(body, /<script src="\/assets\/sante\/js\/lesson-watch\.js\?v=[0-9a-f]{8}"><\/script>/);
  assert.match(body, /Mark complete/);
  // another store's library is simply another embed_url: the page never builds one
  const other = "https://iframe.mediadelivery.net/embed/999001/0a1b2c3d-4e5f-6789-abcd-0123456789ab";
  const b2 = await text(await lessonPage(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_2": [ok(LESSON({ video_url: null, video: STREAM({ embed_url: other }) }))] })), "lsn_2"));
  assert.ok(b2.includes(`<iframe src="${other}"`));
});

test("a Stream lesson that is not ready, or whose embed is off the Stream host, shows no player and no watch script", async () => {
  for (const video of [STREAM({ status: "processing" }), STREAM({ status: "uploading" }), STREAM({ status: "failed" }), STREAM({ embed_url: "https://evil.test/embed/816560/0a1b2c3d-4e5f-6789-abcd-0123456789ab" }), STREAM({ embed_url: "" })]) {
    const body = await text(await lessonPage(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_2": [ok(LESSON({ video_url: null, video }))] })), "lsn_2"));
    assert.doesNotMatch(body, /<iframe|lesson-watch/);
    assert.match(body, /not available yet/);
  }
});

test("a legacy lesson keeps playing its link, with no watch script", async () => {
  for (const over of [{ video: { kind: "legacy", status: "", embed_url: YT, needs_video: false } }, {}]) {
    const body = await text(await lessonPage(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_2": [ok(LESSON(over))] })), "lsn_2"));
    assert.match(body, /<iframe src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/);
    assert.doesNotMatch(body, /lesson-watch|data-watch/);
  }
});

const watchPost = (f: ReturnType<typeof fake>, percent: unknown, id = "lsn_2", token = TOKEN) =>
  lessonWatchPost(dashOf(f, token, new Request("http://www.santetest.com/dashboard/training/lesson/lsn_2/watch/", { method: "POST", body: typeof percent === "string" && percent.startsWith("raw:") ? percent.slice(4) : JSON.stringify({ percent }) })), id);

test("the watch post passes host, token and percent to the API and answers JSON; it never reads the session first", async () => {
  const f = fake({ "member/training/lessons/lsn_2/watch": [ok({ percent: 40 })] });
  const r = await watchPost(f, 40);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { percent: 40 });
  assert.deepEqual(f.calls, [{ path: "member/training/lessons/lsn_2/watch", body: { host: "demo.negosyotest.com", token: TOKEN, percent: 40 } }]);
});

test("the watch post refuses a bad percent, a bad body and a bad id before Django, and maps the API's refusals", async () => {
  const f = fake({});
  for (const bad of [-1, 101, 12.5, "50", null, "raw:not json", "raw:[]"]) assert.equal((await watchPost(f, bad)).status, 400, String(bad));
  assert.equal((await watchPost(f, 50, "a/b")).status, 404);
  assert.equal((await watchPost(f, 50, "lsn_2", "")).status, 401);
  assert.equal(f.calls.length, 0);
  assert.equal((await watchPost(fake({ "member/training/lessons/lsn_2/watch": [err(401)] }), 50)).status, 401);
  assert.equal((await watchPost(fake({ "member/training/lessons/lsn_2/watch": [err(409, "lesson_locked")] }), 50)).status, 409);
  assert.equal((await watchPost(fake({ "member/training/lessons/lsn_2/watch": [err(429)] }), 50)).status, 429);
  assert.equal((await watchPost(fake({ "member/training/lessons/lsn_2/watch": [err(404)] }), 50)).status, 404);
  assert.equal((await watchPost(fake({ "member/training/lessons/lsn_2/watch": [err(500)] }), 50)).status, 503);
});

const WATCH_JS = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "js", "lesson-watch.js"), "utf8");

/** Runs the watch script against a fake Player.js and a fake fetch (`ok` decides whether the server takes a post). */
function runWatch(opts: { stream?: boolean; ok?: () => boolean } = {}) {
  const posts: { url: string; percent: number }[] = [];
  const handlers: Record<string, (d?: unknown) => void> = {};
  const player = { on: (n: string, f: (d?: unknown) => void) => { handlers[n] = f; }, getDuration: (cb: (d: number) => void) => cb(200) };
  const box = { querySelector: () => ({}), getAttribute: () => "lsn_2" };
  const doc = { querySelector: () => (opts.stream === false ? null : box), head: { appendChild: (s: { onload: () => void }) => s.onload() }, createElement: () => ({}) };
  const fetchStub = (url: string, init: { body: string }) => {
    posts.push({ url, percent: JSON.parse(init.body).percent });
    const good = opts.ok ? opts.ok() : true;
    return Promise.resolve({ ok: good });
  };
  new Function("document", "fetch", "playerjs", "setTimeout", WATCH_JS)(doc, fetchStub, { Player: function () { return player; } }, () => 0);
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return {
    posts, settle,
    ready: () => handlers.ready?.(),
    at: async (pct: number) => { handlers.timeupdate?.({ seconds: pct * 2, duration: 200 }); await settle(); },
    ended: async () => { handlers.ended?.(); await settle(); },
  };
}

test("the watch script posts the furthest percent at each 10% step and at the end, only ever upward", async () => {
  assert.equal(WATCH_SCRIPT, "js/lesson-watch.js");
  const w = runWatch();
  w.ready();
  for (const p of [3, 9.9]) await w.at(p);
  assert.equal(w.posts.length, 0, "nothing below the first step");
  await w.at(10);
  await w.at(14);
  await w.at(31); // a jump forward posts the step it reached
  await w.at(20); // seeking back sends nothing
  await w.at(5);
  await w.at(31.5);
  await w.at(59.9);
  await w.at(95);
  await w.ended();
  assert.deepEqual(w.posts.map((p) => p.percent), [10, 30, 50, 90, 100]);
  assert.ok(w.posts.every((p) => p.url === "/dashboard/training/lesson/lsn_2/watch/"));
  await w.ended();
  assert.equal(w.posts.length, 5, "the end is sent once");
});

test("a step the server did not take is tried again at the next step; a page with no watch box does nothing", async () => {
  let up = false;
  const w = runWatch({ ok: () => up });
  w.ready();
  await w.at(10);
  up = true;
  await w.at(25);
  assert.deepEqual(w.posts.map((p) => p.percent), [10, 20]);
  const none = runWatch({ stream: false });
  assert.equal(none.posts.length, 0);
});

/* ---- Mark complete ----------------------------------------------------------------------------------------------- */

test("Mark complete posts host and token, then goes back to the lesson", async () => {
  const f = fake({ ...mkBase(), "member/training/lessons/lsn_2/complete": [ok({ lesson_id: "lsn_2", completed: true, course: { id: "crs_1", completed_lessons: 2, total_lessons: 4, percent: 50 }, next_lesson: { id: "lsn_3", title: "x" } })] });
  const r = await lessonCompletePost(dashOf(f), "lsn_2");
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/dashboard/training/lesson/lsn_2/?c=crs_1");
  assert.deepEqual(f.calls.find((c) => c.path === "member/training/lessons/lsn_2/complete")!.body, { host: "demo.negosyotest.com", token: TOKEN });
});

test("Mark complete on a locked lesson says so; a dead session goes to the store home; a bad id sends nothing", async () => {
  const locked = await lessonCompletePost(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_3/complete": [err(409, "lesson_locked")] })), "lsn_3");
  assert.equal(locked.status, 409);
  assert.match(await text(locked), /Finish the lesson before this one first\./);
  assert.equal((await lessonCompletePost(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_3/complete": [err(401)] })), "lsn_3")).headers.get("location"), "/");
  const f = fake(mkBase());
  assert.equal((await lessonCompletePost(dashOf(f), "a/b")).status, 404);
  assert.equal(f.calls.length, 0);
});

/* ---- the Home slots ---------------------------------------------------------------------------------------------- */

test("the customer-first Home draws no training cards; Training stays one tap away in the Earn with Santé menu", async () => {
  const f = fake({ ...mkBase(), "member/notices": [ok({ notices: [] })], "member/training/live": [ok({ live: LIVE })], "member/training/courses": [ok({ courses: [COURSE()], resume: RESUME })] });
  const page = await text(await homePage(dashOf(f)));
  assert.doesNotMatch(page, /data-slot=|tr-bcb|tr-resume|Start your training/);
  assert.match(page, /href="\/dashboard\/training\/"/);
});

/* ---- small helpers and the page policy --------------------------------------------------------------------------- */

test("durations and times read in plain words, in Philippine time", () => {
  assert.equal(durationText(45), "45 min");
  assert.equal(durationText(60), "1 hr");
  assert.equal(durationText(90), "1 hr 30 min");
  assert.equal(durationText(0), "");
  assert.equal(liveWhen("not a time"), "");
  assert.match(liveWhen("2026-11-20T23:30:00Z"), /Sat, Nov 21, 2026, 7:30 AM/);
});

test("only the lesson player may frame the video hosts; every other path, the training pages included, keeps the strict policy", async () => {
  type Rule = { source: string; headers: { key: string; value: string }[] };
  const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as { pathToRegexp: (s: string) => RegExp };
  const rules = (await nextConfig.headers!()) as Rule[];
  const policyFor = (path: string) => rules.filter((r) => r.headers.some((h) => h.key === "Content-Security-Policy")).filter((r) => pathToRegexp(r.source).test(path))
    .map((r) => r.headers.find((h) => h.key === "Content-Security-Policy")!.value);
  for (const path of ["/dashboard/training/lesson/lsn_2/", "/dashboard/training/lesson/lsn_2"]) {
    const hit = policyFor(path);
    assert.equal(hit.length, 1, path);
    assert.match(hit[0], /frame-src https:\/\/www\.youtube\.com https:\/\/youtube\.com https:\/\/www\.youtube-nocookie\.com https:\/\/youtube-nocookie\.com https:\/\/player\.vimeo\.com https:\/\/iframe\.mediadelivery\.net$/);
  }
  for (const path of ["/dashboard/training/", "/dashboard/training/crs_1/", "/dashboard/", "/dashboard/training/lesson/lsn_2/complete/x"]) {
    const hit = policyFor(path);
    assert.equal(hit.length, 1, path);
    if (!path.includes("/lesson/")) assert.doesNotMatch(hit[0], /frame-src/, path);
  }
});

test("module numbers come from the API's module_number, not the array position; one module is '1 module'", async () => {
  const mods = (DETAIL as unknown as { modules: Record<string, unknown>[] }).modules;
  const detail = { ...DETAIL, modules: [{ ...mods[0], module_number: 4 }, { ...mods[1], module_number: 5 }] };
  const course = await text(await coursePage(dashOf(fake({ ...mkBase(), "member/training/courses/crs_1": [ok(detail)] })), "crs_1"));
  const one = await text(await trainingPage(dashOf(fake({ ...mkBase(), "member/training/courses": [ok({ courses: [COURSE({ module_count: 1 })], resume: null })], "member/training/live": [ok({ live: null })] }))));
  assert.match(one, /<span data-modules>1 module<\/span>/);
  assert.match(course, /<span class="tr-mod-n">4<\/span>/);
  assert.match(course, /Module 4: Basics<\/h2>/);
  assert.match(course, /Module 5: Orders<\/h2>/);
  assert.doesNotMatch(course, /Module 1: Basics/);
  const lesson = await text(await lessonPage(dashOf(fake({ ...mkBase(), "member/training/lessons/lsn_2": [ok(LESSON({ module: { id: "mdl_1", title: "Basics", module_number: 4 }, previous_module: { id: "mdl_0", title: "Intro", first_lesson_id: "lsn_0", module_number: 3 }, next_module: { id: "mdl_2", title: "Orders", first_lesson_id: "lsn_3", module_number: 5 } }))] })), "lsn_2", "crs_1"));
  assert.match(lesson, /&middot; Module 4<\/div>/);
  assert.match(lesson, /&larr; Prev Module 3<\/a>/);
  assert.match(lesson, /Next Module 5 &rarr;<\/a>/);
});

test("the resume card shows the course title on the gradient when the course has no cover, and the cover when it has one", () => {
  const bare = String(resumeCard(RESUME, [COURSE({ image_url: "" })]));
  assert.match(bare, /tr-resume-thumb[^"]*"><span class="tr-thumb-title">How to use the &lt;App&gt;<\/span>/);
  assert.doesNotMatch(bare, /<img/);
  const covered = String(resumeCard(RESUME, [COURSE()]));
  assert.match(covered, /<img src=/);
  assert.doesNotMatch(covered, /tr-thumb-title/);
});
