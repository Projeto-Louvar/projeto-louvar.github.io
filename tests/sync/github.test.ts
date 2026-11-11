import { describe, expect, it } from 'vitest';
import { rateLimitWait } from '../../sync/github';

const NOW = 1_700_000_000_000;

describe('rateLimitWait', () => {
  it('429 sem cabeçalhos: espera 60 s', () => {
    expect(rateLimitWait(429, {}, '', NOW)).toBe(60_000);
  });
  it('retry-after tem prioridade', () => {
    expect(rateLimitWait(403, { 'retry-after': '12', 'x-ratelimit-reset': String(NOW / 1000 + 500) }, '', NOW)).toBe(12_000);
  });
  it('403 com x-ratelimit-remaining 0 usa x-ratelimit-reset', () => {
    const h = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 90) };
    expect(rateLimitWait(403, h, '', NOW)).toBe(90_000);
  });
  it('reset no passado: espera 0', () => {
    const h = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 - 5) };
    expect(rateLimitWait(403, h, '', NOW)).toBe(0);
  });
  it('403 com corpo "secondary rate limit": 60 s', () => {
    expect(rateLimitWait(403, {}, 'You have exceeded a secondary rate limit', NOW)).toBe(60_000);
  });
  it('403 de permissão não é limite', () => {
    expect(rateLimitWait(403, { 'x-ratelimit-remaining': '4999' }, 'Resource not accessible by integration', NOW)).toBeNull();
  });
  it('outros status não são limite', () => {
    expect(rateLimitWait(500, { 'retry-after': '5' }, 'rate limit', NOW)).toBeNull();
    expect(rateLimitWait(200, {}, '', NOW)).toBeNull();
  });
  it('aceita Headers', () => {
    expect(rateLimitWait(403, new Headers({ 'retry-after': '3' }), '', NOW)).toBe(3_000);
  });
});
