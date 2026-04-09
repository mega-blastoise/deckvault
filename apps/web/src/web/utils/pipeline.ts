export const pipeline =
  <I, O>(...fns: Array<(x: I) => O>) =>
  (x: I): O =>
    fns.reduce((v, f) => f(v) as unknown as I, x) as unknown as O;
