import { spawn } from 'node:child_process';

export function openInBrowser(url: string): void {
  const [cmd, ...cmdArgs] =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];

  spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' }).unref();
}
