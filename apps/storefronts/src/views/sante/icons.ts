/* The icon set of TWCinc's negosyoonline_sante_pack/_icon.html, path for path. */
import { html, safe, type Markup } from "../../lib/html.ts";

const PATHS: Record<string, string> = {
  check: "<path d=\"m4.5 12.5 5 5 10-11\"/>",
  close: "<path d=\"M6 6l12 12M18 6 6 18\"/>",
  chevDown: "<path d=\"m6 9 6 6 6-6\"/>",
  chevL: "<path d=\"m15 6-6 6 6 6\"/>",
  chevR: "<path d=\"m9 6 6 6-6 6\"/>",
  star: "<path d=\"m12 3.5 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.9l6.1-.8z\"/>",
  shield: "<path d=\"M12 3.2 19 6v5.4c0 4.2-2.8 7.4-7 9.4-4.2-2-7-5.2-7-9.4V6z\"/><path d=\"m9 12 2 2 4-4\"/>",
  truck: "<path d=\"M3 7h10v9H3zM13 10h4l3 3v3h-7z\"/><circle cx=\"7\" cy=\"18\" r=\"1.6\"/><circle cx=\"17\" cy=\"18\" r=\"1.6\"/>",
  calOff: "<path d=\"M4 6.5h16V20H4zM8 3.5v4M16 3.5v4M4 11h16\"/><path d=\"m9.5 15 5 3.5M14.5 15l-5 3.5\"/>",
  tag: "<path d=\"M3.5 11.2V4h7.2l9.3 9.3-7.2 7.2z\"/><circle cx=\"7.6\" cy=\"7.6\" r=\"1.2\"/>",
  repeatOff: "<path d=\"M4 9a5 5 0 0 1 5-5h7M20 15a5 5 0 0 1-5 5H8\"/><path d=\"m16 1.5 3 2.5-3 2.5M8 17.5 5 20l3 2.5\"/>",
  spark: "<path d=\"M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9z\"/>",
  grass: "<path d=\"M12 21c-2.5-3-5.5-5-8.5-6\"/><path d=\"M12 21c-1.5-5-3.5-9-5.5-12.5\"/><path d=\"M12 21c0-6 .4-10.5 1.5-15.5\"/><path d=\"M12 21c2-5 4.5-8.5 7-11.5\"/>",
  lock: "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 10.5V7.5a4 4 0 0 1 8 0v3\"/>",
  user: "<circle cx=\"12\" cy=\"8.5\" r=\"3.5\"/><path d=\"M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5\"/>",
  infinity: "<path d=\"M12 12c-2-2.7-3.7-4-5.5-4a4 4 0 0 0 0 8c1.8 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.7 4 5.5 4a4 4 0 0 0 0-8c-1.8 0-3.5 1.3-5.5 4z\"/>",
  doc: "<path d=\"M6.5 3.5h7.5l4 4v13h-11.5z\"/><path d=\"M14 3.5v4h4M9.5 11h6M9.5 14h6M9.5 17h4\"/>",
  peso: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M10 17V7.5h2.8a2.6 2.6 0 0 1 0 5.2H10M8 9.6h8M8 11.4h8\"/>",
  calendar: "<rect x=\"4\" y=\"5.5\" width=\"16\" height=\"14.5\" rx=\"2\"/><path d=\"M8 3.5v4M16 3.5v4M4 10h16\"/><path stroke-width=\"2.4\" d=\"M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 16.8h.01M12 16.8h.01\"/>",
  cart: "<path d=\"M3.5 4.5h2.2l2 10.5h10.3l1.9-7.5H6.6\"/><circle cx=\"9.5\" cy=\"19\" r=\"1.3\"/><circle cx=\"17\" cy=\"19\" r=\"1.3\"/>",
  video: "<rect x=\"3.5\" y=\"7\" width=\"12\" height=\"10\" rx=\"2\"/><path d=\"m15.5 11 5-3v8l-5-3\"/>",
  crown: "<path d=\"M3.5 8 8 12l4-6.5 4 6.5 4.5-4-1.7 10H5.2z\"/><path d=\"M5.2 20.5h13.6\"/>",
  arrowR: "<path d=\"M4.5 12h15M13.5 6l6 6-6 6\"/>",
  leaf: "<path d=\"M5 19.5c0-8.5 5.8-14.3 15-15 0 9-5.8 15-15 15z\"/><path d=\"M5 19.5 13.5 11\"/>",
  image: "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"14\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.6\"/><path d=\"m4 17.5 5-5 4 4 2.5-2.5 5 4.5\"/>",
  chat: "<path d=\"M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17h0A2.5 2.5 0 0 1 4 14.5z\"/>",
  clock: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/>",
  mail: "<rect x=\"3.5\" y=\"5.5\" width=\"17\" height=\"13\" rx=\"2\"/><path d=\"M4 7l8 6 8-6\"/>",
  phone: "<path d=\"M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2z\"/>",
};

/** {% include "_icon.html" with name=... cls=... filled=... %}. The path text is this file's, never a request's. */
export function icon(name: string, cls: string, filled = false): Markup {
  const body = PATHS[name];
  if (body === undefined) throw new Error(`No such icon: ${name}`);
  return html`<svg viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="${filled ? "none" : "currentColor"}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${cls}">${safe(body)}</svg>`;
}
