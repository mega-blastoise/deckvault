import React, { useEffect } from 'react';

import { type DocumentProps } from './Document.types';

function Document(props: DocumentProps) {
  useEffect(() => console.log('Mounted on the client'), []);
  return (
    <html lang="en">
      <head>
        <title>{props.title}</title>
        <meta name="description" content={props.description} />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <base href="/" />
        <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/css/index.css" />
        {/* Page-level styles for all routes */}
        <link rel="stylesheet" href="/css/pages.css" />
        {/* Default Catppuccin theme - will be swapped by ThemeProvider on client */}
        <link
          id="catppuccin-theme"
          rel="stylesheet"
          href="/css/themes/catppuccin-mocha.css"
        />
      </head>
      <body>
        <main>{props.children}</main>
      </body>
    </html>
  );
}

export default Document;
