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

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
/** The picture-less thumbnail: one of four Santé gradients, by position. */
const gradient = (i: number): string => `tr-g${(i % 4) + 1}`;
const dayFormat = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", day: "numeric" });
const monthFormat = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short" });

/** The next live training banner (TWCinc's .uni-bcb); nothing at all when there is none. "Live now" while it is on. */
export function liveCard(live: Live | null, now: Date = new Date()): Markup {
  if (!live) return html``;
  const start = Date.parse(live.starts_at);
  const image = safeImage(live.thumbnail_url);
  const when = liveWhen(live.starts_at);
  const length = durationText(live.duration_minutes);
  const join = /^https:\/\/[^\s"'<>]+$/.test(live.join_url) ? live.join_url : "";
  const isLive = !Number.isNaN(start) && start <= now.getTime() && now.getTime() < start + Math.max(live.duration_minutes, 1) * 60000;
  const button = join ? html`<a class="tr-btn tr-btn-gold" href="${join}" rel="noopener noreferrer" target="_blank">${isLive ? "Join the live" : "Join"}</a>` : "";
  const date = !Number.isNaN(start) && !isLive
    ? html`<div class="tr-cal" aria-hidden="true"><b>${dayFormat.format(new Date(start))}</b><span>${monthFormat.format(new Date(start))}</span></div>` : "";
  return html`<section class="tr-bcb" data-tr="live" aria-labelledby="tr-live-h">
  ${date}
  <div class="tr-bcb-tx">
    ${isLive ? html`<span class="tr-badge-live"><span class="tr-live-dot"></span>Live now</span>` : html`<div class="tr-eyebrow">Next live training</div>`}
    <h2 id="tr-live-h">${live.title}</h2>
    ${isLive ? html`<p class="tr-when">Streaming now &mdash; join the session</p>` : when ? html`<p class="tr-when">${when}${length ? html` &middot; ${length}` : ""}</p>` : ""}
    ${live.description ? html`<p class="tr-bcb-desc">${live.description}</p>` : ""}
  </div>
  ${image ? html`<img class="tr-bcb-img" src="${image}" alt="" loading="lazy">` : ""}
  ${button}
</section>`;
}

/** "Pick up where you left off": the next lesson to take, with the course's progress when the list has it; nothing when none. */
export function resumeCard(resume: Resume | null, courses: Course[] = []): Markup {
  if (!resume) return html``;
  const course = courses.find((c) => c.id === resume.course.id);
  const image = course ? safeImage(course.image_url) : "";
  const index = Math.max(0, courses.findIndex((c) => c.id === resume.course.id));
  return html`<section class="tr-card tr-resume" data-tr="resume" aria-labelledby="tr-resume-h">
  <div class="tr-thumb tr-resume-thumb ${gradient(index)}">${image ? html`<img src="${image}" alt="" loading="lazy">` : html`<span class="tr-thumb-title">${resume.course.title}</span>`}</div>
  <div class="tr-resume-tx">
    <div class="tr-eyebrow tr-eyebrow-gold">Pick up where you left off</div>
    <h2 id="tr-resume-h">${resume.course.title}</h2>
    <p class="tr-meta">Next: ${resume.title}</p>
    ${course ? html`${progressBar(course.percent, "Course progress")}<p class="tr-meta"><b>${course.percent}% complete</b> &middot; ${course.completed_lessons} of ${plural(course.total_lessons, "lesson")}</p>` : ""}
  </div>
  <a class="tr-btn tr-btn-go" href="${lessonHref(resume.id, resume.course.id)}">${PLAY} Continue</a>
</section>`;
}

/** The two slots of the Home. Each keeps its marker; each is empty when there is nothing to show. */
export function homeSlots(live: Live | null, resume: Resume | null, courses: Course[] = [], now: Date = new Date()): Markup {
  return html`<div data-slot="next-live-training">${liveCard(live, now)}</div><div data-slot="pick-up-where-you-left-off">${resumeCard(resume, courses)}</div>`;
}

function courseCard(c: Course, i: number): Markup {
  const image = safeImage(c.image_url);
  const done = c.total_lessons > 0 && c.percent >= 100;
  const thumb = html`<div class="tr-thumb ${gradient(i)}">${image ? html`<img src="${image}" alt="" loading="lazy">` : html`<span class="tr-thumb-title">${c.title}</span>`}
    ${c.coming_soon ? html`<span class="tr-chip tr-chip-soon">${COMING_SOON}</span>` : done ? html`<span class="tr-chip tr-chip-done">&#10003; Completed</span>` : html`<span class="tr-chip">${plural(c.total_lessons, "lesson")}</span>`}</div>`;
  if (c.coming_soon) {
    return html`<div class="tr-card tr-cc tr-card-off" data-course="${c.id}">${thumb}<div class="tr-cc-bd"><h3 class="tr-card-title">${c.title}</h3>${c.description ? html`<p class="tr-card-desc">${c.description}</p>` : ""}</div></div>`;
  }
  const label = done ? "Review Course" : c.percent > 0 ? "Continue" : "Start Course";
  return html`<a class="tr-card tr-cc" href="${courseHref(c.id)}" data-course="${c.id}">${thumb}<div class="tr-cc-bd">
    <h3 class="tr-card-title">${c.title}</h3>
    ${c.description ? html`<p class="tr-card-desc">${c.description}</p>` : ""}
    <div class="tr-prog">${progressBar(c.percent, `${c.title} progress`)}<b>${c.percent}%</b></div>
    <p class="tr-meta">${c.module_count > 0 ? html`<span data-modules>${plural(c.module_count, "module")}</span> &middot; ` : ""}${c.completed_lessons}/${plural(c.total_lessons, "lesson")}</p>
    <span class="tr-btn tr-btn-go tr-btn-full">${label}</span></div></a>`;
}

/** /dashboard/training/: the University home. */
export function universityContent(live: Live | null, resume: Resume | null, courses: Course[], now: Date = new Date()): Markup {
  return html`<div class="pd md-plain tr-page" data-md-page="training">
  <header class="tr-ph"><h1>Training</h1><p>Courses and live trainings to help you learn and grow.</p></header>
  ${liveCard(live, now)}${resumeCard(resume, courses)}
  <section aria-labelledby="tr-all-h"><div class="tr-sect"><h2 id="tr-all-h" class="tr-h2">All Courses</h2><span>${plural(courses.length, "course")}</span></div>
  ${courses.length ? html`<div class="tr-grid">${courses.map(courseCard)}</div>` : html`<section class="md-card" data-tr="no-courses"><p>${NO_COURSES}</p></section>`}
  </section>
</div>`;
}

function lessonRowMarkup(l: LessonRow, courseId: string, current = "", next = ""): Markup {
  const icon = l.completed ? CHECK : l.locked ? LOCK : PLAY;
  const state = l.completed ? "done" : l.locked ? "lock" : "open";
  const tag = l.id === current ? html`<span class="tr-now">Now</span>` : l.id === next && !l.completed ? html`<span class="tr-now">Up next</span>` : "";
  const inner = html`<span class="tr-ic" aria-hidden="true">${icon}</span><span class="tr-lt">${l.title}</span>${tag}${l.duration ? html`<span class="tr-ld">${l.duration}</span>` : ""}`;
  const cls = `tr-ls tr-ls-${state}${l.id === current ? " tr-ls-cur" : ""}`;
  if (l.locked) return html`<div class="${cls}" data-lesson="${l.id}"><span class="sr-only">Locked: </span>${inner}</div>`;
  return html`<a class="${cls}" href="${lessonHref(l.id, courseId)}" data-lesson="${l.id}"${l.id === current ? html` aria-current="page"` : ""}>${l.completed ? html`<span class="sr-only">Completed: </span>` : ""}${inner}</a>`;
}

/** /dashboard/training/<course>/: the hero, then the modules as accordions (a details element, no script). Locked lessons have no link. */
export function courseContent(c: CourseDetail): Markup {
  const image = safeImage(c.image_url);
  const nextId = c.next_lesson?.id ?? "";
  // The module to read first stays open: the one holding the next lesson, else the first.
  const openAt = Math.max(0, c.modules.findIndex((m) => m.lessons.some((l) => l.id === nextId)));
  return html`<div class="pd md-plain tr-page" data-md-page="course">
  <a class="tr-crumb" href="${TRAINING_PATH}">&larr; Back to Training</a>
  <section class="tr-hero">
    <div class="tr-hero-tx">
      <div class="tr-eyebrow">Course</div>
      <h1>${c.title}</h1>
      ${c.description ? html`<p class="tr-hero-desc">${c.description}</p>` : ""}
      <div class="tr-hero-prog">${progressBar(c.percent, "Course progress")}<p class="tr-hero-meta"><b>${c.percent}% complete</b> &middot; ${c.completed_lessons} of ${plural(c.total_lessons, "lesson")}</p></div>
      ${c.next_lesson ? html`<p><a class="tr-btn tr-btn-gold" href="${lessonHref(c.next_lesson.id, c.id)}">${c.completed_lessons > 0 ? "Continue" : "Start"}: ${c.next_lesson.title}</a></p>` : ""}
    </div>
    ${image ? html`<div class="tr-hero-side"><div class="tr-thumb tr-g1"><img src="${image}" alt="" loading="lazy"></div></div>` : ""}
  </section>
  ${c.modules.length ? c.modules.map((m, i) => {
    const full = m.total_lessons > 0 && m.completed_lessons >= m.total_lessons;
    return html`<details class="tr-mod${full ? " tr-mod-done" : ""}" data-module="${m.id}"${i === openAt ? html` open` : ""}>
    <summary class="tr-mod-h"><span class="tr-mod-n">${full ? CHECK : String(m.module_number || i + 1)}</span>
      <span class="tr-mod-tx"><h2 id="tr-m-${m.id}">Module ${m.module_number || i + 1}: ${m.title}</h2><span class="tr-mod-s">${plural(m.total_lessons, "lesson")}</span></span>
      <span class="tr-count${full ? " tr-count-full" : ""}">${m.completed_lessons} / ${m.total_lessons}${full ? " \u2713" : ""}</span><span class="tr-chev" aria-hidden="true"></span></summary>
    <div class="tr-mod-b">${m.lessons.map((l) => lessonRowMarkup(l, c.id, "", nextId))}</div>
  </details>`;
  }) : html`<section class="md-card"><p>No lessons here yet.</p></section>`}
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

/** /dashboard/training/lesson/<id>/: the hero, the player, the lesson list (sticky), previous/next module and Next Lesson. */
export function lessonContent(l: Lesson): Markup {
  const total = l.lessons.length;
  const done = l.lessons.filter((x) => x.completed).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const position = Math.max(1, l.lessons.findIndex((x) => x.id === l.id) + 1);
  const nextLesson = l.next_lesson
    ? (l.next_lesson_locked
      ? html`<span class="tr-btn tr-btn-off" aria-disabled="true">Next Lesson &rarr; <small>Mark this lesson complete first</small></span>`
      : html`<a class="tr-btn tr-btn-go" href="${lessonHref(l.next_lesson.id, l.course.id)}">Next Lesson &rarr;</a>`)
    : "";
  return html`<div class="pd md-plain tr-page" data-md-page="lesson">
  <a class="tr-crumb" href="${courseHref(l.course.id)}">&larr; Back to ${l.course.title}</a>
  <section class="tr-hero tr-lhero">
    <div class="tr-hero-tx">
      <div class="tr-eyebrow">${l.course.title}${l.module.module_number > 0 ? html` &middot; Module ${l.module.module_number}` : ""}</div>
      <p class="tr-lhero-title">${l.module.title}</p>
      <p class="tr-hero-meta">Lesson ${position} of ${total} &middot; ${plural(done, "lesson")} completed in this module</p>
    </div>
    <div class="tr-ring" style="--p:${percent}" role="img" aria-label="${done} of ${total} lessons complete"><b>${done}/${total}</b></div>
  </section>
  <div class="tr-lgrid">
    <div>
      ${player(l)}
      <section class="tr-lmeta">
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
    <aside class="tr-plist" aria-label="Lessons in this module">
      <div class="tr-plist-head"><div class="tr-eyebrow">${l.course.title}</div><h2>${l.module.title}</h2>${progressBar(percent, "Module progress")}<p class="tr-hero-meta">${done} of ${total} lessons complete</p></div>
      ${l.lessons.map((x) => lessonRowMarkup(x, l.course.id, l.id))}
      <div class="tr-plist-foot">
        ${l.previous_module ? html`<a href="${lessonHref(l.previous_module.first_lesson_id, l.course.id)}">&larr; Prev Module${l.previous_module.module_number > 0 ? html` ${l.previous_module.module_number}` : ""}</a>` : html`<span class="tr-dis">&larr; Prev Module</span>`}
        ${l.next_module ? html`<a href="${lessonHref(l.next_module.first_lesson_id, l.course.id)}">Next Module${l.next_module.module_number > 0 ? html` ${l.next_module.module_number}` : ""} &rarr;</a>` : html`<span class="tr-dis">Next Module &rarr;</span>`}
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
