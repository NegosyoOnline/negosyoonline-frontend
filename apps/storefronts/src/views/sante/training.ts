/* The member Training screens, after TWCinc's University (app/university/templates/university/course/home.html, module.html,
   lesson.html and static/dashboard/subscriber/css/university.css), adapted to the Santé member dashboard: the md-card, the boxed
   page, light and dark. Plain markup, no script. Comments, certificates and the 90%-watched rule are not ported.
   The video is an iframe of an allowlisted embed host only (the same rule as the backend's, apps/training/services.py). */
import { html, type Markup } from "../../lib/html.ts";
import type { Course, CourseDetail, Lesson, LessonRow, Live, Resume } from "../../lib/training-api.ts";
import { pageHero } from "./member-dash.ts";
import { safeImage } from "./shop-shell.ts";

export const TRAINING_PATH = "/dashboard/training/";
export const NO_COURSES = "No courses yet. They will appear here.";
export const LOCKED_LINE = "Finish the lesson before this one first.";
export const COMING_SOON = "Coming Soon";

/** The ids Django makes: nothing else is put in an address. */
export const TRAINING_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const courseHref = (id: string): string => `${TRAINING_PATH}${encodeURIComponent(id)}/`;
export function lessonHref(id: string, courseId = ""): string {
  const base = `${TRAINING_PATH}lesson/${encodeURIComponent(id)}/`;
  return TRAINING_ID.test(courseId) ? `${base}?c=${encodeURIComponent(courseId)}` : base;
}

const CHECK: Markup = html`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const LOCK: Markup = html`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const PLAY: Markup = html`<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>`;

const whenFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});

/** "Sat, Nov 14, 2026, 7:00 PM" in Philippine time, "" when the time cannot be read. */
export function liveWhen(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : `${whenFormat.format(new Date(t))} (Philippine time)`;
}

/** "45 min", "1 hr", "1 hr 30 min". */
export function durationText(minutes: number): string {
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

const progressBar = (percent: number, label: string): Markup =>
  html`<div class="tr-bar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div>`;

/** The next live training card; nothing at all when there is none. */
export function liveCard(live: Live | null): Markup {
  if (!live) return html``;
  const image = safeImage(live.thumbnail_url);
  const when = liveWhen(live.starts_at);
  const length = durationText(live.duration_minutes);
  const join = /^https:\/\/[^\s"'<>]+$/.test(live.join_url) ? live.join_url : "";
  return html`<section class="md-card tr-live" data-tr="live" aria-labelledby="tr-live-h">
  ${image ? html`<img class="tr-live-img" src="${image}" alt="" loading="lazy">` : ""}
  <div class="tr-live-body">
    <span class="md-kind tr-kind">Next live training</span>
    <h2 id="tr-live-h">${live.title}</h2>
    ${when ? html`<p class="tr-meta">${when}${length ? html` &middot; ${length}` : ""}</p>` : ""}
    ${live.description ? html`<p class="tr-desc">${live.description}</p>` : ""}
    ${join ? html`<p><a class="md-app-btn" href="${join}" rel="noopener noreferrer" target="_blank">Join</a></p>` : ""}
  </div>
</section>`;
}

/** "Pick up where you left off": the next lesson to take; nothing when the member has none. */
export function resumeCard(resume: Resume | null): Markup {
  if (!resume) return html``;
  return html`<section class="md-card tr-resume" data-tr="resume" aria-labelledby="tr-resume-h">
  <h2 id="tr-resume-h">Pick up where you left off</h2>
  <p class="tr-meta">${resume.course.title}</p>
  <p class="tr-resume-line"><a class="md-app-btn" href="${lessonHref(resume.id, resume.course.id)}">${PLAY} ${resume.title}</a></p>
</section>`;
}

/** The two slots of the Home. Each keeps its marker; each is empty when there is nothing to show. */
export function homeSlots(live: Live | null, resume: Resume | null): Markup {
  return html`<div data-slot="next-live-training">${liveCard(live)}</div><div data-slot="pick-up-where-you-left-off">${resumeCard(resume)}</div>`;
}

function courseCard(c: Course): Markup {
  const image = safeImage(c.image_url);
  const picture = image ? html`<img class="tr-card-img" src="${image}" alt="" loading="lazy">` : html`<span class="tr-card-img tr-card-blank" aria-hidden="true"></span>`;
  const body = html`${picture}<span class="tr-card-body">
    <span class="tr-card-title">${c.title}</span>
    ${c.description ? html`<span class="tr-card-desc">${c.description}</span>` : ""}
    ${c.coming_soon ? html`<span class="tr-soon">${COMING_SOON}</span>`
      : html`${progressBar(c.percent, `${c.title} progress`)}<span class="tr-card-pct">${c.percent}% &middot; ${c.completed_lessons}/${c.total_lessons} lessons</span>`}
  </span>`;
  return c.coming_soon
    ? html`<div class="tr-card tr-card-off" data-course="${c.id}">${body}</div>`
    : html`<a class="tr-card" href="${courseHref(c.id)}" data-course="${c.id}">${body}</a>`;
}

/** /dashboard/training/: the University home. */
export function universityContent(live: Live | null, resume: Resume | null, courses: Course[]): Markup {
  return html`<div class="pd md-plain tr-page" data-md-page="training">${pageHero("Training", "")}
  ${liveCard(live)}${resumeCard(resume)}
  <section aria-labelledby="tr-all-h"><h2 id="tr-all-h" class="tr-h2">All Courses</h2>
  ${courses.length ? html`<div class="tr-grid">${courses.map(courseCard)}</div>` : html`<section class="md-card" data-tr="no-courses"><p>${NO_COURSES}</p></section>`}
  </section>
</div>`;
}

function lessonRowMarkup(l: LessonRow, courseId: string, current = ""): Markup {
  const icon = l.completed ? CHECK : l.locked ? LOCK : PLAY;
  const state = l.completed ? "done" : l.locked ? "lock" : "open";
  const inner = html`<span class="tr-ic" aria-hidden="true">${icon}</span><span class="tr-lt">${l.title}</span>${l.id === current ? html`<span class="tr-now">Now</span>` : ""}${l.duration ? html`<span class="tr-ld">${l.duration}</span>` : ""}`;
  const cls = `tr-ls tr-ls-${state}${l.id === current ? " tr-ls-cur" : ""}`;
  if (l.locked) return html`<div class="${cls}" data-lesson="${l.id}"><span class="sr-only">Locked: </span>${inner}</div>`;
  return html`<a class="${cls}" href="${lessonHref(l.id, courseId)}" data-lesson="${l.id}"${l.id === current ? html` aria-current="page"` : ""}>${l.completed ? html`<span class="sr-only">Completed: </span>` : ""}${inner}</a>`;
}

/** /dashboard/training/<course>/: the modules, each with n/m and its lessons. Locked lessons have no link. */
export function courseContent(c: CourseDetail): Markup {
  const image = safeImage(c.image_url);
  return html`<div class="pd md-plain tr-page" data-md-page="course">
  <a class="tr-crumb" href="${TRAINING_PATH}">&larr; Back to Training</a>
  <section class="md-card tr-course-head">
    ${image ? html`<img class="tr-course-img" src="${image}" alt="" loading="lazy">` : ""}
    <div class="tr-course-info">
      <h1>${c.title}</h1>
      ${c.description ? html`<p class="tr-desc">${c.description}</p>` : ""}
      ${progressBar(c.percent, "Course progress")}
      <p class="tr-card-pct">${c.percent}% &middot; ${c.completed_lessons}/${c.total_lessons} lessons</p>
      ${c.next_lesson ? html`<p><a class="md-app-btn" href="${lessonHref(c.next_lesson.id, c.id)}">${c.completed_lessons > 0 ? "Continue" : "Start"}: ${c.next_lesson.title}</a></p>` : ""}
    </div>
  </section>
  ${c.modules.length ? c.modules.map((m, i) => html`<section class="md-card tr-module" data-module="${m.id}" aria-labelledby="tr-m-${m.id}">
    <div class="tr-module-head"><h2 id="tr-m-${m.id}">Module ${i + 1}: ${m.title}</h2><span class="tr-count">${m.completed_lessons}/${m.total_lessons}</span></div>
    ${m.lessons.map((l) => lessonRowMarkup(l, c.id))}
  </section>`) : html`<section class="md-card"><p>No lessons here yet.</p></section>`}
</div>`;
}

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"]);

/** The embed address the player may frame, or "": https, no port, user, query secret or fragment, on YouTube, Vimeo or Bunny
    Stream embed paths only (backend apps/training/services.py video_url_ok). The query string is kept off. */
export function embedUrl(value: string): string {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return "";
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password || u.hash) return "";
  const host = u.hostname.toLowerCase();
  const ok = YOUTUBE_HOSTS.has(host) ? /^\/embed\/[A-Za-z0-9_-]{11}$/.test(u.pathname)
    : host === "player.vimeo.com" ? /^\/video\/[0-9]{1,15}$/.test(u.pathname)
    : host === "iframe.mediadelivery.net" ? /^\/(embed|play)\/[0-9]{1,10}\/[A-Za-z0-9-]{8,64}$/.test(u.pathname)
    : false;
  return ok ? `https://${host}${u.pathname}` : "";
}

/** The CSP frame-src list for the lesson page (next.config.ts uses the same hosts). */
export const VIDEO_FRAME_HOSTS = ["https://www.youtube.com", "https://youtube.com", "https://www.youtube-nocookie.com", "https://youtube-nocookie.com", "https://player.vimeo.com", "https://iframe.mediadelivery.net"];

function player(l: Lesson): Markup {
  const src = embedUrl(l.video_url);
  if (!src) return html`<div class="tr-player tr-player-msg"><p>The video for this lesson is not available yet.</p></div>`;
  return html`<div class="tr-player"><iframe src="${src}" title="${l.title}" loading="lazy" allowfullscreen
    allow="fullscreen; picture-in-picture; encrypted-media" sandbox="allow-scripts allow-same-origin allow-presentation"
    referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

/** /dashboard/training/lesson/<id>/: the player, the module's lesson list, previous/next module and Next Lesson. */
export function lessonContent(l: Lesson): Markup {
  const done = l.lessons.filter((x) => x.completed).length;
  const percent = l.lessons.length ? Math.round((done / l.lessons.length) * 100) : 0;
  const nextLesson = l.next_lesson
    ? (l.next_lesson_locked
      ? html`<span class="tr-btn tr-btn-off" aria-disabled="true">Next Lesson &rarr; <small>Mark this lesson complete first</small></span>`
      : html`<a class="tr-btn tr-btn-go" href="${lessonHref(l.next_lesson.id, l.course.id)}">Next Lesson &rarr;</a>`)
    : "";
  return html`<div class="pd md-plain tr-page" data-md-page="lesson">
  <a class="tr-crumb" href="${courseHref(l.course.id)}">&larr; Back to ${l.course.title}</a>
  <div class="tr-lgrid">
    <div>
      ${player(l)}
      <section class="md-card tr-lmeta">
        <h1>${l.title}</h1>
        <p class="tr-meta">${l.module.title}${l.duration ? html` &middot; ${l.duration}` : ""}</p>
        ${l.description ? html`<p class="tr-desc">${l.description}</p>` : ""}
        <div class="tr-lnav">
          ${l.previous_lesson ? html`<a class="tr-btn" href="${lessonHref(l.previous_lesson.id, l.course.id)}">&larr; Previous Lesson</a>` : ""}
          ${l.completed
            ? html`<span class="tr-done" data-tr="completed">${CHECK} Completed</span>`
            : html`<form method="post" action="${TRAINING_PATH}lesson/${encodeURIComponent(l.id)}/complete/"><button type="submit" class="md-app-btn tr-complete">Mark complete</button></form>`}
          ${nextLesson}
        </div>
      </section>
    </div>
    <aside class="md-card tr-plist" aria-label="Lessons in this module">
      <div class="tr-plist-head"><h2>${l.module.title}</h2>${progressBar(percent, "Module progress")}<p class="tr-card-pct">${done} of ${l.lessons.length} lessons complete</p></div>
      ${l.lessons.map((x) => lessonRowMarkup(x, l.course.id, l.id))}
      <div class="tr-plist-foot">
        ${l.previous_module ? html`<a href="${lessonHref(l.previous_module.first_lesson_id, l.course.id)}">&larr; Prev Module</a>` : html`<span class="tr-dis">&larr; Prev Module</span>`}
        ${l.next_module ? html`<a href="${lessonHref(l.next_module.first_lesson_id, l.course.id)}">Next Module &rarr;</a>` : html`<span class="tr-dis">Next Module &rarr;</span>`}
      </div>
    </aside>
  </div>
</div>`;
}

/** A locked lesson (409): a plain message and the way back. */
export function lockedContent(courseId: string): Markup {
  const back = TRAINING_ID.test(courseId) ? courseHref(courseId) : TRAINING_PATH;
  return html`<div class="pd md-plain tr-page" data-md-page="lesson-locked">${pageHero("Lesson locked", "")}
  <section class="md-card"><p>${LOCKED_LINE}</p><p><a class="md-app-btn" href="${back}">${TRAINING_ID.test(courseId) ? "Back to the course" : "Back to Training"}</a></p></section>
</div>`;
}
