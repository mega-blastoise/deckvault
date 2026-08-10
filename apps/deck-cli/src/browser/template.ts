import serialize from 'serialize-javascript';

import PAGE_CSS from './page.css' with { type: 'text' };
import PAGE_JS from './page.client.js.txt' with { type: 'text' };

export interface PageOptions {
  readonly decksDir: string;
  readonly initialSlug: string | null;
}

export const pageAssets = {
  js: PAGE_JS,
  css: PAGE_CSS
};

/**
 * The client bundle and stylesheet are inlined into the binary as text imports
 * but served from their own routes rather than inlined into the HTML.
 *
 * Inlining is not safe here: React DOM's source contains the literal
 * `innerHTML="<script></script>"`, and that closing tag terminates a surrounding
 * <script> element early, dumping the rest of the bundle into the page as text.
 * Escaping would work, but serving the assets removes the whole class of
 * problem — and the page is still self-contained, since nothing is read from
 * disk at runtime.
 */
export function renderPage(options: PageOptions): string {
  const config = serialize(
    { decksDir: options.decksDir, initialSlug: options.initialSlug },
    { isJSON: true }
  );

  // Theme is resolved and applied before the stylesheet paints, so a light-theme
  // user never sees a dark flash. Stored preference wins; otherwise follow the
  // OS. React reads the resolved attribute back rather than deriving it again.
  const themeScript = `(function(){try{var t=localStorage.getItem('johto-theme');` +
    `if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}` +
    `document.documentElement.setAttribute('data-theme',t);}` +
    `catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>johto — decks</title>
<script>${themeScript}</script>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<div id="root"></div>
<script>window.__JOHTO__ = ${config};</script>
<script type="module" src="/app.js"></script>
</body>
</html>`;
}
