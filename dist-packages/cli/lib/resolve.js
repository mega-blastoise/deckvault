const path = require('node:path');
const fs = require('node:fs');

const PLATFORM_MAP = {
  'linux:x64':    'linux-x64',
  'linux:arm64':  'linux-arm64',
  'darwin:x64':   'darwin-x64',
  'darwin:arm64': 'darwin-arm64',
};

function platformSuffix() {
  const key = `${process.platform}:${process.arch}`;
  const suffix = PLATFORM_MAP[key];
  if (!suffix) {
    throw new Error(
      `Unsupported platform ${key}. Supported: linux-x64, linux-arm64, darwin-x64, darwin-arm64. ` +
      `Windows is planned for v1.1.`
    );
  }
  return suffix;
}

function resolvePackage(pkgName) {
  try {
    const pkgJson = require.resolve(`${pkgName}/package.json`);
    return path.dirname(pkgJson);
  } catch (err) {
    throw new Error(
      `Missing package ${pkgName}. This usually means npm skipped the platform-specific ` +
      `optional dependency. Try \`npm install --force\` or report at https://github.com/mega-blastoise/deckvault/issues. ` +
      `Original error: ${err.message}`
    );
  }
}

function resolveBinaries() {
  const suffix = platformSuffix();
  const cliPkg = resolvePackage(`@johto-ai/cli-${suffix}`);
  const mcpPkg = resolvePackage(`@johto-ai/mcp-server-${suffix}`);
  const dataPkg = resolvePackage('@johto-ai/card-data');

  const cliBin = path.join(cliPkg, 'bin', 'johto');
  const mcpBin = path.join(mcpPkg, 'bin', 'pokemon-mcp-server');
  const dbPath = path.join(dataPkg, 'data', 'pokemon-data.sqlite3.db');

  for (const [p, label] of [[cliBin, 'CLI binary'], [mcpBin, 'MCP server'], [dbPath, 'card database']]) {
    if (!fs.existsSync(p)) {
      throw new Error(`${label} not found at ${p}. Try reinstalling: \`npm install -g @johto-ai/cli\`.`);
    }
  }

  return { cliBin, mcpBin, dbPath };
}

module.exports = { resolveBinaries, platformSuffix };
