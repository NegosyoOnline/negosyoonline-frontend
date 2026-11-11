/* A served site's home until its real home page lands: the store name only. */
import { html, type Markup } from "../lib/html.ts";

export function placeholderDocument(displayName: string): Markup {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${displayName}</title>
</head>
<body>
<h1>${displayName}</h1>
</body>
</html>
`;
}
