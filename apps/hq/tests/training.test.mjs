/* training.js, training-course.js, training-live.js: the Training section of HQ (ClickUp z8uq9mezdj). Courses in order with
   Coming Soon, reorder, archive, delete behind a confirm; the course editor with modules and lessons and the backend's
   video-link refusal; the live training form in Philippine time. The page decides nothing: the backend does. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE } from "./page.mjs";

const PUB = new URL("../public/", import.meta.url).pathname;
const idsOf = (file) => [...fs.readFileSync(PUB + file, "utf8").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const key = (call) => call.method + " " + call.url.slice(BASE.length + 1);

async function page(file, scripts, pathname, table, search = "") {
  const p = open(["hq.js", "shell.js", "finance-common.js", "training-common.js", scripts], { ids: idsOf(file), pathname, search, answers: (call) => {
    const k = key(call);
    const reply = Object.prototype.hasOwnProperty.call(table, k) ? table[k] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + k);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  return { ...p, sent: (k) => p.calls.filter((c) => key(c) === k), text: (id) => p.node[id].textContent };
}
const byLabel = (root, label) => root.all((n) => n.tagName === "BUTTON" && n.getAttribute("aria-label") === label)[0];
const chipsOf = (li) => li.all((n) => n.classList.contains("chip")).map((n) => n.textContent);
const refusal = (fields) => [400, { error: { code: "invalid_request", message: "x", fields } }];

/* ---- the courses page --------------------------------------------------------------------------------------------- */

const C = (id, title, over = {}) => ({ id, title, slug: id, description: "", image_url: null, order: 1, active: true, archived_at: null, module_count: 1, lesson_count: 2, active_lesson_count: 2, ...over });
const COURSES = [C("crs_1", "How to use the App"), C("crs_2", "Ways to Earn", { active_lesson_count: 0, lesson_count: 0, module_count: 0 }), C("crs_3", "Old course", { active: false, archived_at: "2026-11-01T00:00:00Z" })];
const L = "POST training/courses/list/";
const coursesPage = (extra = {}) => page("training.html", "training.js", "/training/", { "GET me/": [200, ME], [L]: [200, { courses: COURSES }], ...extra });

test("the courses page lists every course in order with its state, and Coming Soon for a course with no active lessons", async () => {
  const p = await coursesPage();
  assert.deepEqual(p.calls.map(key), ["GET me/", L]);
  assert.equal(p.node["v-main"].hidden, false);
  const rows = p.node["courses"].children;
  assert.deepEqual(rows.map((li) => li.all((n) => n.tagName === "A")[0].textContent), ["How to use the App", "Ways to Earn", "Old course"]);
  assert.equal(rows[0].all((n) => n.tagName === "A")[0].getAttribute("href"), "/training/course/?id=crs_1");
  assert.deepEqual(chipsOf(rows[0]), ["Active"]);
  assert.deepEqual(chipsOf(rows[1]), ["Active", "Coming Soon"]);
  assert.deepEqual(chipsOf(rows[2]), ["Archived"]);
  assert.equal(byLabel(rows[0], "Move How to use the App up").disabled, true);
  assert.equal(byLabel(rows[2], "Move Old course down").disabled, true);
  assert.equal(byLabel(rows[2], "Restore Old course") !== undefined, true);
});

test("Down sends every course id in the new order, then the list is read again", async () => {
  const p = await coursesPage({ "POST training/courses/reorder/": [200, { courses: COURSES }] });
  byLabel(p.node["courses"].children[0], "Move How to use the App down").fire("click");
  await settle();
  assert.deepEqual(p.sent("POST training/courses/reorder/")[0].body, { ids: ["crs_2", "crs_1", "crs_3"] });
  assert.equal(p.sent(L).length, 2);
  assert.equal(p.text("c-msg"), "Order saved.");
});

test("Archive sends archived true; Restore sends archived false", async () => {
  const p = await coursesPage({ "POST training/courses/update/": [200, C("crs_1", "x")] });
  byLabel(p.node["courses"].children[0], "Archive How to use the App").fire("click");
  await settle();
  byLabel(p.node["courses"].children[2], "Restore Old course").fire("click");
  await settle();
  assert.deepEqual(p.sent("POST training/courses/update/").map((c) => c.body), [{ id: "crs_1", archived: true }, { id: "crs_3", archived: false }]);
});

test("Delete asks first, says what goes with the course, and sends nothing until confirmed", async () => {
  const p = await coursesPage({ "POST training/courses/delete/": [200, { status: "deleted" }] });
  byLabel(p.node["courses"].children[1], "Delete Ways to Earn").fire("click");
  assert.equal(p.node["m-confirm"].hidden, false);
  assert.equal(p.text("m-confirm-h"), "Delete this course?");
  assert.match(p.text("m-confirm-sub"), /Ways to Earn.*progress.*cannot be undone/);
  assert.equal(p.sent("POST training/courses/delete/").length, 0);
  p.node["confirm-go"].fire("click");
  await settle();
  assert.deepEqual(p.sent("POST training/courses/delete/")[0].body, { id: "crs_2" });
  assert.equal(p.node["m-confirm"].hidden, true);
  assert.equal(p.text("c-msg"), "Course deleted.");
});

test("Cancel on the delete dialog sends nothing", async () => {
  const p = await coursesPage();
  byLabel(p.node["courses"].children[0], "Delete How to use the App").fire("click");
  p.node["confirm-cancel"].fire("click");
  assert.equal(p.node["m-confirm"].hidden, true);
  assert.equal(p.calls.filter((c) => /delete/.test(c.url)).length, 0);
});

test("New course: an empty title is refused on the page; the backend's message shows under the field; success opens the editor", async () => {
  const p = await coursesPage({ "POST training/courses/create/": [200, C("crs_9", "New")] });
  p.node["n-form"].fire("submit");
  assert.equal(p.text("n-title-err"), "Enter a title.");
  assert.equal(p.node["n-title"].getAttribute("aria-invalid"), "true");
  assert.equal(p.sent("POST training/courses/create/").length, 0);
  p.node["n-title"].value = " New ";
  p.node["n-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent("POST training/courses/create/")[0].body, { title: "New", description: "" });
  assert.equal(p.location.assigned, "/training/course/?id=crs_9");
  const q = await coursesPage({ "POST training/courses/create/": refusal({ title: ["Too long."] }) });
  q.node["n-title"].value = "x";
  q.node["n-form"].fire("submit");
  await settle();
  assert.equal(q.text("n-title-err"), "Too long.");
});

test("signed out goes to the sign-in page; an unreachable list shows the try-again card", async () => {
  const out = await page("training.html", "training.js", "/training/", { "GET me/": [401, { error: { code: "unauthenticated", message: "x" } }] });
  assert.equal(out.location.replaced, "/sign-in/");
  const down = await coursesPage({ [L]: [500, {}] });
  assert.equal(down.node["v-down"].hidden, false);
});

/* ---- the course editor -------------------------------------------------------------------------------------------- */

const LESSON = (id, over = {}) => ({ id, module_id: "mdl_1", title: "Lesson " + id, duration: "5:00", description: "d", video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ", image_url: null, order: 1, active: true, ...over });
const TREE = () => ({ ...C("crs_1", "How to use the App", { description: "Start", image_url: "https://x.example.test/a.png" }), modules: [
  { id: "mdl_1", course_id: "crs_1", title: "Basics", order: 1, active: true, lessons: [LESSON("lsn_1"), LESSON("lsn_2", { active: false, video_url: null })] },
  { id: "mdl_2", course_id: "crs_1", title: "Orders", order: 2, active: true, lessons: [] },
] });
const G = "POST training/courses/get/";
const editorPage = (extra = {}, search = "?id=crs_1") => page("training-course.html", "training-course.js", "/training/course/", { "GET me/": [200, ME], [G]: () => [200, TREE()], ...extra }, search);

test("the editor reads the course named in the address and shows its details, modules and lessons", async () => {
  const p = await editorPage();
  assert.deepEqual(p.sent(G)[0].body, { id: "crs_1" });
  assert.equal(p.node["e-title"].value, "How to use the App");
  assert.equal(p.node["e-slug"].value, "crs_1");
  assert.equal(p.node["e-active"].checked, true);
  assert.equal(p.text("e-state"), "Active");
  assert.equal(p.text("e-pic"), "A picture is set.");
  const mods = p.node["modules"].children;
  assert.equal(mods.length, 2);
  const lessons = mods[0].all((n) => n.tagName === "LI");
  assert.equal(lessons.length, 2);
  assert.match(lessons[0].textContent, /Lesson lsn_1.*5:00.*Video set\./);
  assert.deepEqual(chipsOf(lessons[1]), ["Off"]);
  assert.match(lessons[1].textContent, /No video yet\./);
  assert.match(mods[1].textContent, /No lessons in this module yet\./);
});

test("an address with no course id, or a bad one, goes back to the course list", async () => {
  for (const search of ["", "?id=", "?id=a/b"]) {
    const p = await editorPage({}, search);
    assert.equal(p.location.replaced, "/training/", search);
    assert.equal(p.sent(G).length, 0);
  }
});

test("Save course validates title and slug on the page, sends the values, and shows the backend's slug message", async () => {
  const p = await editorPage({ "POST training/courses/update/": [200, TREE()] });
  p.node["e-title"].value = "";
  p.node["e-form"].fire("submit");
  assert.equal(p.text("e-title-err"), "Enter a title.");
  p.node["e-title"].value = "Renamed";
  p.node["e-slug"].value = "";
  p.node["e-form"].fire("submit");
  assert.equal(p.text("e-slug-err"), "Enter a slug.");
  assert.equal(p.sent("POST training/courses/update/").length, 0);
  p.node["e-slug"].value = "renamed";
  p.node["e-active"].checked = false;
  p.node["e-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent("POST training/courses/update/")[0].body, { id: "crs_1", title: "Renamed", slug: "renamed", description: "Start", active: false });
  assert.equal(p.text("e-msg"), "Course saved.");
  const q = await editorPage({ "POST training/courses/update/": refusal({ slug: ["That slug is taken."] }) });
  q.node["e-form"].fire("submit");
  await settle();
  assert.equal(q.text("e-slug-err"), "That slug is taken.");
});

test("a lesson with a video link the backend refuses shows the backend's own words under the field, and the dialog stays open", async () => {
  const msg = "Use an https embed link from YouTube (youtube.com/embed/...), Vimeo (player.vimeo.com/video/...) or Bunny Stream (iframe.mediadelivery.net/embed/...).";
  const p = await editorPage({ "POST training/lessons/create/": refusal({ video_url: [msg] }) });
  byLabel(p.node["modules"].children[1], "Add a lesson to module 2").fire("click");
  assert.equal(p.node["m-lesson"].hidden, false);
  assert.equal(p.text("m-lesson-h"), "New lesson in Orders");
  p.node["l-form"].fire("submit");
  assert.equal(p.text("l-title-err"), "Enter a title.");
  p.node["l-title"].value = "Intro";
  p.node["l-video"].value = " https://example.test/watch?v=1 ";
  p.node["l-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent("POST training/lessons/create/")[0].body, { title: "Intro", duration: "", video_url: "https://example.test/watch?v=1", description: "", active: true, module: "mdl_2" });
  assert.equal(p.text("l-video-err"), msg);
  assert.equal(p.node["l-video"].getAttribute("aria-invalid"), "true");
  assert.equal(p.node["m-lesson"].hidden, false);
});

test("a good lesson is added, the dialog closes and the course is read again", async () => {
  const p = await editorPage({ "POST training/lessons/create/": [200, LESSON("lsn_9")] });
  byLabel(p.node["modules"].children[1], "Add a lesson to module 2").fire("click");
  p.node["l-title"].value = "Intro";
  p.node["l-form"].fire("submit");
  await settle();
  assert.equal(p.node["m-lesson"].hidden, true);
  assert.equal(p.sent(G).length, 2);
  assert.equal(p.text("e-msg"), "Lesson added.");
});

test("Edit opens the lesson with its values and sends an update with its id; its picture box shows", async () => {
  const p = await editorPage({ "POST training/lessons/update/": [200, LESSON("lsn_1")] });
  byLabel(p.node["modules"].children[0], "Edit lesson Lesson lsn_1").fire("click");
  assert.equal(p.text("m-lesson-h"), "Edit lesson");
  assert.equal(p.node["l-title"].value, "Lesson lsn_1");
  assert.equal(p.node["l-dur"].value, "5:00");
  assert.equal(p.node["l-pic-box"].hidden, false);
  p.node["l-dur"].value = "6:30";
  p.node["l-form"].fire("submit");
  await settle();
  assert.equal(p.sent("POST training/lessons/update/")[0].body.id, "lsn_1");
  assert.equal(p.sent("POST training/lessons/update/")[0].body.duration, "6:30");
  assert.equal(p.text("e-msg"), "Lesson saved.");
});

test("deleting a lesson or a module asks first; confirmed it sends the delete", async () => {
  const p = await editorPage({ "POST training/lessons/delete/": [200, { status: "deleted" }], "POST training/modules/delete/": [200, { status: "deleted" }] });
  byLabel(p.node["modules"].children[0], "Delete lesson Lesson lsn_2").fire("click");
  assert.equal(p.text("m-confirm-h"), "Delete this lesson?");
  assert.equal(p.sent("POST training/lessons/delete/").length, 0);
  p.node["confirm-go"].fire("click");
  await settle();
  assert.deepEqual(p.sent("POST training/lessons/delete/")[0].body, { id: "lsn_2" });
  byLabel(p.node["modules"].children[0], "Delete module 1").fire("click");
  assert.equal(p.text("m-confirm-h"), "Delete this module?");
  assert.match(p.text("m-confirm-sub"), /Basics.*2 lessons/);
  p.node["confirm-go"].fire("click");
  await settle();
  assert.deepEqual(p.sent("POST training/modules/delete/")[0].body, { id: "mdl_1" });
});

test("Add a module needs a title; Up and Down send the whole list in the new order", async () => {
  const p = await editorPage({ "POST training/modules/create/": [200, {}], "POST training/modules/reorder/": [200, { modules: [] }], "POST training/lessons/reorder/": [200, { lessons: [] }] });
  p.node["am-form"].fire("submit");
  assert.equal(p.text("am-title-err"), "Enter a module title.");
  p.node["am-title"].value = "Earnings";
  p.node["am-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent("POST training/modules/create/")[0].body, { course: "crs_1", title: "Earnings" });
  byLabel(p.node["modules"].children[0], "Move module 1 down").fire("click");
  await settle();
  assert.deepEqual(p.sent("POST training/modules/reorder/")[0].body, { course: "crs_1", ids: ["mdl_2", "mdl_1"] });
  byLabel(p.node["modules"].children[0], "Move lesson Lesson lsn_1 down").fire("click");
  await settle();
  assert.deepEqual(p.sent("POST training/lessons/reorder/")[0].body, { module: "mdl_1", ids: ["lsn_2", "lsn_1"] });
});

test("a module is saved with its title and Active box; an empty title is refused on the page", async () => {
  const p = await editorPage({ "POST training/modules/update/": [200, {}] });
  const form = p.node["modules"].children[0].children[0];
  const [title, , check] = [form.children[0], 0, form.children[1].children[0]];
  title.value = "";
  form.fire("submit");
  assert.match(p.node["modules"].children[0].textContent, /Enter a module title\./);
  title.value = "Basics 2";
  check.checked = false;
  form.fire("submit");
  await settle();
  assert.deepEqual(p.sent("POST training/modules/update/")[0].body, { id: "mdl_1", title: "Basics 2", active: false });
});

test("the course picture goes up as a form with kind, id and file; too large a file never leaves the page", async () => {
  const p = await editorPage({ "POST training/image/set/": [200, TREE()], "POST training/image/clear/": [200, TREE()] });
  p.node["e-up"].fire("click");
  assert.equal(p.text("e-pic-err"), "Choose a picture first.");
  p.node["e-file"].files = [{ name: "big.png", size: 3 * 1024 * 1024, type: "image/png" }];
  p.node["e-up"].fire("click");
  assert.equal(p.text("e-pic-err"), "The picture is larger than 2 MB.");
  assert.equal(p.sent("POST training/image/set/").length, 0);
  p.node["e-file"].files = [{ name: "a.png", size: 1000, type: "image/png" }];
  p.node["e-up"].fire("click");
  await settle();
  const form = p.sent("POST training/image/set/")[0].body;
  assert.equal(form.get("kind"), "course");
  assert.equal(form.get("id"), "crs_1");
  p.node["e-clear"].fire("click");
  await settle();
  assert.deepEqual(p.sent("POST training/image/clear/")[0].body, { kind: "course", id: "crs_1" });
});

test("a course that is not found says so", async () => {
  const p = await editorPage({ [G]: [404, { error: { code: "not_found", message: "x" } }] });
  assert.equal(p.node["v-down"].hidden, false);
  assert.equal(p.text("h-down"), "This course was not found.");
});

/* ---- live trainings ----------------------------------------------------------------------------------------------- */

const LIVE = (over = {}) => ({ id: "liv_1", title: "Weekly Q&A", starts_at: "2026-11-20T11:00:00Z", duration_minutes: 90, description: "Bring questions.", join_url: "https://meet.example.test/room", thumbnail_url: null,
  template_key: "sante", site_id: null, active: true, ...over });
const LL = "POST training/live/list/";
const livePage = (extra = {}) => page("training-live.html", "training-live.js", "/training/live/", { "GET me/": [200, ME], [LL]: [200, { live: [LIVE(), LIVE({ id: "liv_2", title: "Site only", site_id: "site_a", active: false, join_url: "" })] }], ...extra });
const fill = (p, over = {}) => {
  const v = { "f-title": "Kickoff", "f-date": "2026-11-21", "f-time": "19:30", "f-dur": "60", "f-desc": "", "f-join": "", "f-site": "", ...over };
  for (const [id, value] of Object.entries(v)) p.node[id].value = value;
};

test("the live page lists each training with its Philippine time, scope and state", async () => {
  const p = await livePage();
  const rows = p.node["lives"].children;
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Weekly Q&A.*Nov 20, 2026, 7:00 PM \(Philippine time\), 90 min, every Santé site, join link set/);
  assert.match(rows[1].textContent, /one site only, no join link/);
  assert.deepEqual(chipsOf(rows[0]), ["Active"]);
  assert.deepEqual(chipsOf(rows[1]), ["Off"]);
  assert.equal(p.node["f-dur"].value, "60");
  assert.equal(p.node["f-active"].checked, true);
});

test("the live form refuses a missing title, a bad date or time, a bad length and a non-https link on the page", async () => {
  const p = await livePage();
  fill(p, { "f-title": "", "f-date": "2026-02-30", "f-time": "7pm", "f-dur": "0", "f-join": "http://x.test" });
  p.node["f-form"].fire("submit");
  assert.equal(p.text("f-title-err"), "Enter a title.");
  assert.match(p.text("f-starts-err"), /YYYY-MM-DD.*HH:MM.*Philippine time/);
  assert.match(p.text("f-dur-err"), /1 to 1440/);
  assert.equal(p.text("f-join-err"), "Use an https link.");
  assert.equal(p.sent("POST training/live/create/").length, 0);
});

test("a good live training is sent with the Philippine offset, no site as null, and the list is read again", async () => {
  const p = await livePage({ "POST training/live/create/": [200, LIVE()] });
  fill(p, { "f-desc": " Hi ", "f-join": "https://meet.example.test/x" });
  p.node["f-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent("POST training/live/create/")[0].body, { title: "Kickoff", starts_at: "2026-11-21T19:30:00+08:00", duration_minutes: 60, description: "Hi", join_url: "https://meet.example.test/x", site: null, active: true });
  assert.equal(p.text("v-msg"), "Live training created.");
  assert.equal(p.sent(LL).length, 2);
  assert.equal(p.node["f-title"].value, "");
});

test("the backend's messages for the join link and the site show under their fields", async () => {
  const p = await livePage({ "POST training/live/create/": refusal({ join_url: ["Use an https link."], site: ["Choose a Santé site, or leave it empty for every Santé site."] }) });
  fill(p, { "f-site": "nope" });
  p.node["f-form"].fire("submit");
  await settle();
  assert.equal(p.text("f-join-err"), "Use an https link.");
  assert.match(p.text("f-site-err"), /Choose a Sant/);
  assert.equal(p.sent("POST training/live/create/")[0].body.site, "nope");
});

test("Edit fills the form in Philippine time and Save sends an update with the id", async () => {
  const p = await livePage({ "POST training/live/update/": [200, LIVE()] });
  byLabel(p.node["lives"].children[0], "Edit Weekly Q&A").fire("click");
  assert.equal(p.node["f-date"].value, "2026-11-20");
  assert.equal(p.node["f-time"].value, "19:00");
  assert.equal(p.node["f-dur"].value, "90");
  assert.equal(p.text("f-h"), "Edit live training");
  assert.equal(p.node["f-pic-box"].hidden, false);
  p.node["f-form"].fire("submit");
  await settle();
  const body = p.sent("POST training/live/update/")[0].body;
  assert.equal(body.id, "liv_1");
  assert.equal(body.starts_at, "2026-11-20T19:00:00+08:00");
  assert.equal(p.text("v-msg"), "Live training saved.");
});

test("Delete asks first and sends the delete only when confirmed", async () => {
  const p = await livePage({ "POST training/live/delete/": [200, { status: "deleted" }] });
  byLabel(p.node["lives"].children[1], "Delete Site only").fire("click");
  assert.equal(p.text("m-confirm-h"), "Delete this live training?");
  assert.equal(p.sent("POST training/live/delete/").length, 0);
  p.node["confirm-go"].fire("click");
  await settle();
  assert.deepEqual(p.sent("POST training/live/delete/")[0].body, { id: "liv_2" });
});

test("the thumbnail goes up as a form with kind live", async () => {
  const p = await livePage({ "POST training/image/set/": [200, LIVE()] });
  byLabel(p.node["lives"].children[0], "Edit Weekly Q&A").fire("click");
  p.node["f-file"].files = [{ name: "t.webp", size: 500, type: "image/webp" }];
  p.node["f-up"].fire("click");
  await settle();
  const form = p.sent("POST training/image/set/")[0].body;
  assert.equal(form.get("kind"), "live");
  assert.equal(form.get("id"), "liv_1");
});

/* ---- the files ---------------------------------------------------------------------------------------------------- */

test("the three pages carry the signed-in shell and load their scripts in order; the routes exist", () => {
  const config = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  for (const [file, script, route] of [["training.html", "training", "/training/"], ["training-course.html", "training-course", "/training/course/"], ["training-live.html", "training-live", "/training/live/"]]) {
    const html = fs.readFileSync(PUB + file, "utf8");
    assert.match(html, /id="acct-btn"[^>]*aria-controls="nav-sheet"/, file);
    for (const id of ["nav-sheet", "sheet-nav", "sheet-name", "sheet-email", "sheet-out", "m-confirm"]) assert.match(html, new RegExp(`id="${id}"`), file + " " + id);
    assert.deepEqual([...html.matchAll(/<script src="\/assets\/js\/([a-z-]+)\.js/g)].map((m) => m[1]), ["theme", "config", "hq", "menu", "shell", "finance-common", "training-common", script], file);
    assert.ok(config.includes(`{ source: "${route}", destination: "/${file}" }`), route);
    assert.doesNotMatch(html, /<input[^>]*\bvalue=/i, file);
  }
  assert.match(fs.readFileSync(PUB + "training-course.html", "utf8"), /youtube\.com\/embed.*player\.vimeo\.com\/video.*iframe\.mediadelivery\.net\/embed/);
});
