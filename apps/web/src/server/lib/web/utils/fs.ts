import fs from 'fs/promises';
import path from 'path';

type AssetMap = { js: string | null; css: string | null };

let cachedAssets: AssetMap | null = null;

async function resolveAssets(): Promise<AssetMap> {
  if (cachedAssets) return cachedAssets;
  const assetsDir = path.resolve(process.cwd(), 'out', 'www');
  const files = await fs.readdir(assetsDir, {
    encoding: 'utf-8',
    recursive: true,
    withFileTypes: true
  });
  const jsFile = files.find(
    (f) => f.isFile() && f.name.startsWith('browser') && f.name.endsWith('.js')
  );
  const cssFile = files.find(
    (f) => f.isFile() && f.name.startsWith('browser') && f.name.endsWith('.css')
  );
  cachedAssets = {
    js: jsFile ? path.join('/www', jsFile.name) : null,
    css: cssFile ? path.join('/www', cssFile.name) : null
  };
  return cachedAssets;
}

export async function getBrowserJavascriptBundle(): Promise<string | null> {
  return (await resolveAssets()).js;
}

export async function getBrowserCssSheet(): Promise<string | null> {
  return (await resolveAssets()).css;
}
