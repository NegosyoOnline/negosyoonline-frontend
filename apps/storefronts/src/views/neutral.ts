/* The neutral answer: no site name, no product name, no script. Every host that is not a
   served site, and every path that has no page, gets this and nothing more. */
import { html, htmlResponse, type Markup } from "../lib/html.ts";

export const NOT_FOUND_TEXT = "Page not found.";

export function neutralDocument(text: string): Markup {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${text}</title>
</head>
<body>
<p>${text}</p>
</body>
</html>
`;
}

export function neutralNotFound(): Response {
  return htmlResponse(neutralDocument(NOT_FOUND_TEXT), 404);
}
