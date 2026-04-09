import path from 'path';

import { mimeTypes } from './mime';

const staticFileDirectories = ['public', 'out'] as const;

export async function isRequestForStaticFile(request: Request) {
  const url = new URL(request.url);
  if (!path.extname(url.pathname)) return false;
  for (const directory of staticFileDirectories) {
    const stdpath = path.join(process.cwd(), directory, url.pathname);
    try {
      if (await Bun.file(stdpath).exists()) {
        return true;
      }
    } catch (e) {
      return false;
    }
  }

  return false;
}

export async function handleStaticFileRequest(request: Request) {
  const url = new URL(request.url);
  for (const directory of staticFileDirectories) {
    const stdpath = path.join(process.cwd(), directory, url.pathname);
    try {
      const file = Bun.file(stdpath);
      if (await file.exists()) {
        const ext = path.extname(url.pathname);
        const contentType = mimeTypes[ext] ?? 'application/octet-stream';
        return new Response(file, {
          headers: { 'Content-Type': contentType },
          status: 200
        });
      }
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  }

  return new Response('Not Found', { status: 404 });
}
