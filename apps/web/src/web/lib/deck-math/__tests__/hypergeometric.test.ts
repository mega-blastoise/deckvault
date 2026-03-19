import { describe, it, expect } from 'bun:test';
import { hypergeometricPMF, hypergeometricCDF } from '../hypergeometric';

describe('hypergeometricPMF', () => {
  it('returns ≈ 0.6005 for PMF(60, 4, 7, 0)', () => {
    const p = hypergeometricPMF(60, 4, 7, 0);
    expect(Math.abs(p - 0.6005)).toBeLessThan(0.001);
  });

  it('returns 0 when k > K', () => {
    expect(hypergeometricPMF(60, 2, 7, 3)).toBe(0);
  });

  it('returns 0 when k > n', () => {
    expect(hypergeometricPMF(60, 10, 3, 5)).toBe(0);
  });

  it('returns 0 when n-k > N-K', () => {
    expect(hypergeometricPMF(10, 9, 9, 0)).toBe(0);
  });

  it('all PMF values for k=0..min(K,n) sum to 1', () => {
    const N = 60; const K = 4; const n = 7;
    let total = 0;
    for (let k = 0; k <= Math.min(K, n); k++) total += hypergeometricPMF(N, K, n, k);
    expect(Math.abs(total - 1)).toBeLessThan(1e-10);
  });
});

describe('hypergeometricCDF', () => {
  it('returns ≈ 0.3995 for CDF(60, 4, 7, 1)', () => {
    const p = hypergeometricCDF(60, 4, 7, 1);
    expect(Math.abs(p - 0.3995)).toBeLessThan(0.001);
  });

  it('returns ≈ 1 - PMF(k=0) for minK=1', () => {
    const pmf0 = hypergeometricPMF(60, 4, 7, 0);
    const cdf1 = hypergeometricCDF(60, 4, 7, 1);
    expect(Math.abs(cdf1 - (1 - pmf0))).toBeLessThan(1e-10);
  });

  it('never exceeds 1', () => {
    const p = hypergeometricCDF(60, 60, 7, 1);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('CDF(minK=0) equals 1 for valid inputs', () => {
    const p = hypergeometricCDF(60, 4, 7, 0);
    expect(Math.abs(p - 1)).toBeLessThan(1e-10);
  });
});
