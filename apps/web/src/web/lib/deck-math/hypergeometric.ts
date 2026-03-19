/**
 * P(X = k): probability of drawing exactly k successes
 * in a sample of n draws from a population of N containing K successes.
 *
 * Uses log-space arithmetic to avoid integer overflow for large combinations.
 */
export function hypergeometricPMF(N: number, K: number, n: number, k: number): number {
  if (k > K || k > n || n - k > N - K) return 0;
  return Math.exp(
    logCombination(K, k) + logCombination(N - K, n - k) - logCombination(N, n)
  );
}

/**
 * P(X >= minK): probability of drawing AT LEAST minK successes.
 */
export function hypergeometricCDF(N: number, K: number, n: number, minK: number): number {
  let probability = 0;
  for (let k = minK; k <= Math.min(K, n); k++) {
    probability += hypergeometricPMF(N, K, n, k);
  }
  return Math.min(1, probability);
}

/**
 * log(C(n, k)) using Stirling / log-gamma to avoid overflow.
 */
function logCombination(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function logFactorial(n: number): number {
  let result = 0;
  for (let i = 2; i <= n; i++) result += Math.log(i);
  return result;
}
