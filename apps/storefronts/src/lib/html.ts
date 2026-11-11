/* Pages are finished HTML documents built by template functions, not React. The `html` tag
   escapes every interpolated value unless it is already Markup (the result of another `html`
   call, or text deliberately marked with `safe`). */

export class Markup {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Marks text as finished HTML. Only for text this codebase wrote, never for a value that
    came from a request or from the API. */
export function safe(value: string): Markup {
  return new Markup(value);
}

type Value = Markup | string | number | boolean | null | undefined | Value[];

function render(value: Value): string {
  if (value instanceof Markup) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false || value === true) return "";
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: Value[]): Markup {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Markup(out);
}

/** A page answer. Never stored by a cache and never indexed, as the approved site sends. */
export function htmlResponse(document: Markup, status = 200): Response {
  return new Response(document.value, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
