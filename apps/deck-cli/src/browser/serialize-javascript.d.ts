declare module 'serialize-javascript' {
  function serialize(val: unknown, options?: { isJSON?: boolean }): string;
  export = serialize;
}
