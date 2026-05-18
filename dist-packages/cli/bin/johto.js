#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { resolveBinaries } = require('../lib/resolve');

const { cliBin, mcpBin, dbPath } = resolveBinaries();

const args = process.argv.slice(2);
const env = {
  ...process.env,
  JOHTO_MCP_SERVER_PATH: mcpBin,
  JOHTO_DB_PATH: dbPath,
};

const child = spawn(cliBin, args, { stdio: 'inherit', env });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
