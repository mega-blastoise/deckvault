export function getJavascriptEnvironment(): 'server' | 'browser' {
  if (typeof window === 'undefined') return 'server';
  return 'browser';
}
