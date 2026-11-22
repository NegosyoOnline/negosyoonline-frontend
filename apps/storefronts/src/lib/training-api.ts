/* The member's Training calls to Django (backend apps/training/api.py, routes under /storefront/v1/member/training/), all POST
   {host, token}. Same rules as src/lib/notices-api.ts: the member session travels as data; a 404 is "unavailable" (members are
   off, the host is not served, or the course or lesson is not this member's site); a 401 is "refused" (not signed in); a 409
   lesson_locked is "refused" with that code; anything else is "failed". Every field is read defensively: a row the page cannot
   draw is left out, never half-drawn. */
import { packPost, type Calls, type PackResult } from "./pack-api.ts";

type Args = { host: string; token: string };

export type Ref = { id: string; title: string };
export type Course = {
  id: string; slug: string; title: string; description: string; image_url: string; coming_soon: boolean;
  completed_lessons: number; total_lessons: number; percent: number; module_count: number;
};
export type Resume = { course: Ref; id: string; title: string };
export type LessonRow = { id: string; title: string; duration: string; image_url: string; completed: boolean; locked: boolean };
export type Module = { id: string; title: string; module_number: number; completed_lessons: number; total_lessons: number; lessons: LessonRow[] };
export type CourseDetail = Course & { modules: Module[]; next_lesson: Ref | null };
export type ModuleRef = Ref & { first_lesson_id: string; module_number: number };
/** The lesson's video as the API describes it (R2): `embed_url` already names the lesson's own Bunny Stream library; the page never builds it. */
export type Video = { kind: "stream" | "legacy" | "none"; status: string; embed_url: string; needs_video: boolean };
export type Lesson = {
  id: string; title: string; duration: string; description: string; video_url: string; video: Video; completed: boolean;
  course: Ref; module: Ref & { module_number: number }; lessons: LessonRow[]; previous_lesson: Ref | null; next_lesson: Ref | null; next_lesson_locked: boolean;
  previous_module: ModuleRef | null; next_module: ModuleRef | null;
};
export type Live = { id: string; title: string; starts_at: string; duration_minutes: number; description: string; join_url: string; thumbnail_url: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);

function ref(v: unknown): Ref | null {
  return record(v) && str(v.id) && str(v.title) ? { id: str(v.id), title: str(v.title) } : null;
}
function moduleRef(v: unknown): ModuleRef | null {
  const r = ref(v);
  return r && record(v) && str(v.first_lesson_id) ? { ...r, first_lesson_id: str(v.first_lesson_id), module_number: num(v.module_number) } : null;
}
function course(v: unknown): Course | null {
  if (!record(v) || !str(v.id) || !str(v.title)) return null;
  return {
    id: str(v.id), slug: str(v.slug), title: str(v.title), description: str(v.description), image_url: str(v.image_url),
    coming_soon: v.coming_soon === true, completed_lessons: num(v.completed_lessons), total_lessons: num(v.total_lessons),
    percent: Math.min(100, num(v.percent)), module_count: num(v.module_count),
  };
}
function row(v: unknown): LessonRow[] {
  if (!record(v) || !str(v.id) || !str(v.title)) return [];
  return [{ id: str(v.id), title: str(v.title), duration: str(v.duration), image_url: str(v.image_url), completed: v.completed === true, locked: v.locked === true }];
}
function moduleOf(v: unknown): Module[] {
  if (!record(v) || !str(v.id) || !str(v.title)) return [];
  return [{
    id: str(v.id), title: str(v.title), module_number: num(v.module_number), completed_lessons: num(v.completed_lessons), total_lessons: num(v.total_lessons),
    lessons: Array.isArray(v.lessons) ? v.lessons.flatMap(row) : [],
  }];
}
function video(v: unknown): Video {
  if (!record(v)) return { kind: "none", status: "", embed_url: "", needs_video: false };
  const kind = v.kind === "stream" || v.kind === "legacy" ? v.kind : "none";
  return { kind, status: str(v.status), embed_url: str(v.embed_url), needs_video: v.needs_video === true };
}
function live(v: unknown): Live | null {
  if (!record(v) || !str(v.id) || !str(v.title) || !str(v.starts_at)) return null;
  return {
    id: str(v.id), title: str(v.title), starts_at: str(v.starts_at), duration_minutes: num(v.duration_minutes),
    description: str(v.description), join_url: str(v.join_url), thumbnail_url: str(v.thumbnail_url),
  };
}

/** All courses with this member's progress, and where to pick up. */
export function memberCourses(args: Args, c: Calls): Promise<PackResult<{ courses: Course[]; resume: Resume | null }>> {
  return packPost("member/training/courses", args, (b) => {
    if (!record(b) || !Array.isArray(b.courses)) return null;
    const r = record(b.resume) ? b.resume : null;
    const rc = r ? ref(r.course) : null;
    return {
      courses: b.courses.flatMap((x) => { const k = course(x); return k ? [k] : []; }),
      resume: r && rc && str(r.id) && str(r.title) ? { course: rc, id: str(r.id), title: str(r.title) } : null,
    };
  }, c);
}

export function memberCourse(args: Args & { id: string }, c: Calls): Promise<PackResult<{ course: CourseDetail }>> {
  const { id, ...rest } = args;
  return packPost(`member/training/courses/${encodeURIComponent(id)}`, rest, (b) => {
    const k = course(b);
    if (!k || !record(b) || !Array.isArray(b.modules)) return null;
    return { course: { ...k, modules: b.modules.flatMap(moduleOf), next_lesson: ref(b.next_lesson) } };
  }, c);
}

export function memberLesson(args: Args & { id: string }, c: Calls): Promise<PackResult<{ lesson: Lesson }>> {
  const { id, ...rest } = args;
  return packPost(`member/training/lessons/${encodeURIComponent(id)}`, rest, (b) => {
    if (!record(b) || !str(b.id) || !str(b.title)) return null;
    const cr = ref(b.course);
    const mr = ref(b.module);
    if (!cr || !mr) return null;
    return {
      lesson: {
        id: str(b.id), title: str(b.title), duration: str(b.duration), description: str(b.description), video_url: str(b.video_url), video: video(b.video),
        completed: b.completed === true, course: cr, module: { ...mr, module_number: record(b.module) ? num(b.module.module_number) : 0 }, lessons: Array.isArray(b.lessons) ? b.lessons.flatMap(row) : [],
        previous_lesson: ref(b.previous_lesson), next_lesson: ref(b.next_lesson), next_lesson_locked: b.next_lesson_locked === true,
        previous_module: moduleRef(b.previous_module), next_module: moduleRef(b.next_module),
      },
    };
  }, c);
}

const WATCH_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The furthest point of a lesson's video this member has reached (0 to 100; `ended` when the player fired it). The server keeps the highest and
    completes the lesson itself at 90 or more (or on `ended`): the answer says `completed`, and `next_unlocked` with `next_lesson_id` when the next lesson opened. */
export type Watched = { percent: number; completed: boolean; next_unlocked: boolean; next_lesson_id: string };
export function memberLessonWatch(args: Args & { id: string; percent: number; ended?: boolean }, c: Calls): Promise<PackResult<Watched>> {
  const { id, ...rest } = args;
  return packPost(`member/training/lessons/${encodeURIComponent(id)}/watch`, rest, (b) => {
    if (!record(b)) return { percent: 0, completed: false, next_unlocked: false, next_lesson_id: "" };
    const next = str(b.next_lesson_id);
    return { percent: Math.min(100, num(b.percent)), completed: b.completed === true, next_unlocked: b.next_unlocked === true && WATCH_ID.test(next), next_lesson_id: WATCH_ID.test(next) ? next : "" };
  }, c);
}

/** The next live training that has not ended, or none. */
export function memberLive(args: Args, c: Calls): Promise<PackResult<{ live: Live | null }>> {
  return packPost("member/training/live", args, (b) => (record(b) && "live" in b ? { live: live(b.live) } : null), c);
}
